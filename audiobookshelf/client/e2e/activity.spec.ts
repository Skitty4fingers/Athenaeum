import { test, expect, request, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Admin activity page (who is connected, what they are listening to).
 *
 * The page reports server state rather than anything the client records, so the
 * test drives that state from outside the browser — opening a real playback
 * session through the API, the way a phone or a second device would — and
 * asserts the open page reflects it without a reload.
 *
 * Non-destructive: it opens and closes one playback session and writes no
 * metadata. Still needs E2E_USERNAME / E2E_PASSWORD for an *admin* account,
 * since every endpoint behind this page is admin-only.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000/audiobookshelf/'
const API_ROOT = new URL(BASE).origin + new URL(BASE).pathname.replace(/\/$/, '')
/** Distinctive so the assertions cannot collide with a real client name. */
const DEVICE = 'E2E Activity Probe'

const username = process.env.E2E_USERNAME
const password = process.env.E2E_PASSWORD

function auth(token: string) {
  return { Authorization: `Bearer ${token}` }
}

/** One API sign-in for the file — see the note in live-sync.spec.ts on the auth rate limit. */
let sharedCtx: Promise<{ api: APIRequestContext; token: string; libraryId: string }> | null = null

function apiLogin() {
  sharedCtx ??= (async () => {
    const api = await request.newContext()
    const res = await api.post(`${API_ROOT}/login`, { data: { username, password } })
    if (!res.ok()) throw new Error(`API login failed: ${res.status()}${res.status() === 429 ? ' (auth rate limit — wait or restart the server)' : ''}`)
    const body = await res.json()
    const token = body.user.accessToken as string
    const libs = await (await api.get(`${API_ROOT}/api/libraries`, { headers: auth(token) })).json()
    return { api, token, libraryId: (body.userDefaultLibraryId as string | null) ?? libs.libraries[0].id }
  })()
  return sharedCtx
}

test.afterAll(async () => {
  if (sharedCtx) await (await sharedCtx).api.dispose().catch(() => {})
  sharedCtx = null
})

async function signIn(page: Page) {
  await page.goto('signin')
  await page.getByLabel('Username', { exact: true }).fill(username!)
  await page.getByLabel('Password', { exact: true }).fill(password!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page, 'sign-in did not complete — check credentials and the server auth rate limit').not.toHaveURL(/\/signin/, { timeout: 20_000 })
}

test.describe('admin activity', () => {
  test.skip(!username || !password, 'Set E2E_USERNAME and E2E_PASSWORD to run this against a real server.')

  test('reports connections, and a stream opened elsewhere appears and clears live', async ({ page }) => {
    test.setTimeout(90_000)
    const { api, token, libraryId } = await apiLogin()
    const items = await (await api.get(`${API_ROOT}/api/libraries/${libraryId}/items?limit=1&minified=1`, { headers: auth(token) })).json()
    const item = items.results?.[0]
    test.skip(!item, 'The library under test has no items.')

    await signIn(page)
    await page.goto('activity')
    await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible({ timeout: 15_000 })

    // This very browser is a connection, so presence must be non-zero.
    const onlineTile = page.locator('div:has(> div:text-is("Users online"))').first()
    await expect(onlineTile).toContainText(/[1-9]/)
    await expect(page.getByText('Open connections')).toBeVisible()

    const nowPanel = page.locator('section:has(h2:text-is("Listening now"))')
    let sessionId: string | null = null

    try {
      const session = await (
        await api.post(`${API_ROOT}/api/items/${item.id}/play`, {
          headers: auth(token),
          data: { deviceInfo: { clientName: DEVICE, deviceId: 'e2e-activity' }, supportedMimeTypes: ['audio/mpeg'], mediaPlayer: 'e2e' }
        })
      ).json()
      sessionId = session.id
      await api.post(`${API_ROOT}/api/session/${sessionId}/sync`, { headers: auth(token), data: { currentTime: 20, timeListened: 20, duration: session.duration } })

      // No reload: the socket layer invalidates the presence queries.
      await expect(nowPanel).toContainText(DEVICE, { timeout: 20_000 })
      await expect(nowPanel).toContainText(item.media.metadata.title, { timeout: 20_000 })

      await api.post(`${API_ROOT}/api/session/${sessionId}/close`, { headers: auth(token), data: {} })
      sessionId = null

      // The server emits its stream update *before* dropping the session, so
      // this can take a beat longer than the event itself — see
      // STREAM_SETTLE_MS in lib/socket-sync.ts.
      await expect(nowPanel).not.toContainText(DEVICE, { timeout: 30_000 })
      // The finished session belongs in history, not on the live panel.
      await expect(page.locator('section:has(h2:has-text("Recent sessions"))')).toContainText(DEVICE, { timeout: 20_000 })
    } finally {
      if (sessionId) await api.post(`${API_ROOT}/api/session/${sessionId}/close`, { headers: auth(token), data: {} }).catch(() => {})
    }
  })
})

import { test, expect, request, type APIRequestContext } from '@playwright/test'

/**
 * Live sync (docs/GAP-CLOSURE-PLAN.md lane B, Tier 1).
 *
 * Everything here asserts the same thing from different angles: a change made
 * somewhere *other than this browser* reaches it over Socket.IO without a
 * reload. The "other device" is an authenticated API context — the same thing
 * the phone app or a second browser would be doing, and deliberately not a
 * mutation issued by the page itself (that would pass on the mutation's own
 * onSuccess invalidation and prove nothing about the socket layer).
 *
 * Needs E2E_USERNAME / E2E_PASSWORD, like smoke.spec.ts, and skips itself
 * cleanly without them.
 *
 * NOTE: this mutates the library it runs against — it renames one book and
 * writes listening progress, restoring both afterwards. Run it against a
 * disposable account and library, not your real one.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000/audiobookshelf/'
/** API origin — the Express server, which is also what the SPA talks to. */
const API_ROOT = new URL(BASE).origin + new URL(BASE).pathname.replace(/\/$/, '')

interface Ctx {
  api: APIRequestContext
  token: string
  libraryId: string
}

/**
 * One API sign-in for the whole file, not one per test.
 *
 * The server rate-limits auth (40 attempts per 10 minutes by default). Each
 * test already signs the browser in through the UI, so a second login per test
 * for the "other device" context put a five-test run at ten attempts and made
 * back-to-back runs fail with 429s that look like product bugs.
 */
let sharedCtx: Promise<Ctx> | null = null

function signInApi(username: string, password: string): Promise<Ctx> {
  sharedCtx ??= (async () => {
    const api = await request.newContext()
    const res = await api.post(`${API_ROOT}/login`, { data: { username, password } })
    if (!res.ok()) throw new Error(`API login failed: ${res.status()}${res.status() === 429 ? ' (auth rate limit — wait or restart the server)' : ''}`)
    const body = await res.json()
    const token = body.user.accessToken as string

    const libs = await api.get(`${API_ROOT}/api/libraries`, { headers: { Authorization: `Bearer ${token}` } })
    const libraryId = (body.userDefaultLibraryId as string | null) ?? (await libs.json()).libraries[0].id
    return { api, token, libraryId }
  })()
  return sharedCtx
}

test.afterAll(async () => {
  if (sharedCtx) await (await sharedCtx).api.dispose().catch(() => {})
  sharedCtx = null
})

function auth(token: string) {
  return { Authorization: `Bearer ${token}` }
}

/**
 * Signs the browser in through the UI and lands on the library grid.
 *
 * Waits on the URL leaving /signin rather than on an `h1` — the sign-in screen
 * renders the app name as its own `h1`, so a heading check passes even when
 * sign-in was rejected (a rate limit, say) and hides the real failure.
 */
async function signInBrowser(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('signin')
  await page.getByLabel('Username', { exact: true }).fill(username)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page, 'sign-in did not complete — check credentials and the server auth rate limit').not.toHaveURL(/\/signin/, { timeout: 20_000 })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
}

const username = process.env.E2E_USERNAME
const password = process.env.E2E_PASSWORD

test.describe('live sync', () => {
  test.skip(!username || !password, 'Set E2E_USERNAME and E2E_PASSWORD to run this against a real server.')

  test('a rename on another device reaches the open library grid', async ({ page }) => {
    const { api, token, libraryId } = await signInApi(username!, password!)
    const items = await (await api.get(`${API_ROOT}/api/libraries/${libraryId}/items`, { headers: auth(token) })).json()
    const target = items.results[0]
    test.skip(!target, 'The library under test has no items.')

    const originalTitle: string = target.media.metadata.title
    const renamed = `${originalTitle} ~sync${Date.now() % 100000}`

    await signInBrowser(page, username!, password!)
    await expect(page.locator(`article a[href$="/item/${target.id}"]`)).toBeVisible({ timeout: 15_000 })

    try {
      await api.patch(`${API_ROOT}/api/items/${target.id}/media`, { headers: auth(token), data: { metadata: { title: renamed } } })
      // No reload: the socket event should invalidate ['library-items'] and
      // React Query refetches the mounted grid on its own.
      await expect(page.getByText(renamed).first()).toBeVisible({ timeout: 15_000 })
    } finally {
      await api.patch(`${API_ROOT}/api/items/${target.id}/media`, { headers: auth(token), data: { metadata: { title: originalTitle } } })
    }
    await expect(page.getByText(originalTitle, { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  })

  test('progress from another device reaches an open item page', async ({ page }) => {
    const { api, token, libraryId } = await signInApi(username!, password!)
    const items = await (await api.get(`${API_ROOT}/api/libraries/${libraryId}/items`, { headers: auth(token) })).json()
    const target = items.results[0]
    test.skip(!target, 'The library under test has no items.')

    await signInBrowser(page, username!, password!)
    await page.goto(`item/${target.id}`)
    await expect(page.getByRole('button', { name: /^(Play|Resume)$/ })).toBeVisible({ timeout: 15_000 })

    // Open and advance a playback session that is *not* this browser's.
    const session = await (
      await api.post(`${API_ROOT}/api/items/${target.id}/play`, {
        headers: auth(token),
        data: { deviceInfo: { clientName: 'e2e-other-device', deviceId: 'e2e-other-device' }, supportedMimeTypes: ['audio/mpeg'], mediaPlayer: 'e2e' }
      })
    ).json()

    try {
      await api.post(`${API_ROOT}/api/session/${session.id}/sync`, {
        headers: auth(token),
        data: { currentTime: 30, timeListened: 30, duration: session.duration }
      })
      // Once progress exists the primary action becomes "Resume".
      await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 15_000 })
    } finally {
      await api.post(`${API_ROOT}/api/session/${session.id}/close`, { headers: auth(token), data: { currentTime: 30, timeListened: 0, duration: session.duration } }).catch(() => {})
      const me = await (await api.get(`${API_ROOT}/api/me`, { headers: auth(token) })).json()
      const mp = me.mediaProgress?.find((p: { libraryItemId: string; id: string }) => p.libraryItemId === target.id)
      if (mp) await api.delete(`${API_ROOT}/api/me/progress/${mp.id}`, { headers: auth(token) }).catch(() => {})
      }
  })

  test('this tab’s own playback heartbeats do not refetch the library grid', async ({ page }) => {
    // The player syncs every 15s and the server echoes it back to this same
    // tab; without the own-session guard in lib/socket-sync.ts each heartbeat
    // refetches the whole grid. Needs to outlast two heartbeats.
    test.setTimeout(120_000)
    const { api, token } = await signInApi(username!, password!)

    await signInBrowser(page, username!, password!)
    const firstBook = page.locator('article a[href*="/item/"]').first()
    await expect(firstBook).toBeVisible({ timeout: 15_000 })
    await firstBook.click()
    await expect(page).toHaveURL(/\/item\//)
    await page.getByRole('button', { name: /^(Play|Resume)$/ }).click()
    await expect(page.getByRole('button', { name: 'Pause' }).last()).toBeVisible({ timeout: 20_000 })

    // Back to the grid via SPA history, never page.goto — a full reload drops
    // the in-memory session and would make this assertion vacuous.
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Pause' }).last()).toBeVisible()

    let refetches = 0
    page.on('request', (r) => {
      const url = r.url()
      if (!/\/api\/libraries\/[^/]+\/items/.test(url)) return
      // The player hits the same endpoint with `filter=series.<id>&sort=sequence`
      // to find the next book when one finishes ("Up next"). That is playback
      // behaviour, not a grid refetch, and it fires here whenever the book runs
      // out during the measurement window — count only the unfiltered grid query
      // this test actually left mounted.
      if (/[?&]filter=/.test(url)) return
      refetches++
    })

    await page.waitForTimeout(40_000)

    // Guard against a vacuous pass: if no sync actually reached the server,
    // zero refetches proves nothing.
    const me = await (await api.get(`${API_ROOT}/api/me`, { headers: auth(token) })).json()
    const progressed = (me.mediaProgress ?? []).some((p: { currentTime: number }) => p.currentTime > 0)
    expect(progressed, 'no playback progress reached the server, so no heartbeats fired').toBe(true)
    expect(refetches, 'own playback heartbeats should not refetch the library grid').toBe(0)

    await page.getByRole('button', { name: 'Close player' }).click().catch(() => {})
  })

  test('a collection created, renamed and deleted elsewhere tracks on an open list', async ({ page }) => {
    const { api, token, libraryId: defaultLibrary } = await signInApi(username!, password!)
    const libs = await (await api.get(`${API_ROOT}/api/libraries`, { headers: auth(token) })).json()
    const libraryId = defaultLibrary ?? libs.libraries[0].id
    const items = await (await api.get(`${API_ROOT}/api/libraries/${libraryId}/items?limit=1&minified=1`, { headers: auth(token) })).json()
    const seed = items.results?.[0]
    test.skip(!seed, 'The library under test has no items.')

    const name = `E2E Collection ${Date.now() % 100000}`
    const renamed = `${name} renamed`
    let collectionId: string | null = null

    await signInBrowser(page, username!, password!)
    await page.goto('collections')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

    try {
      // A collection cannot be created empty server-side, so seed it with one book.
      const created = await (await api.post(`${API_ROOT}/api/collections`, { headers: auth(token), data: { libraryId, name, books: [seed.id] } })).json()
      collectionId = created.id
      await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 })

      await api.patch(`${API_ROOT}/api/collections/${collectionId}`, { headers: auth(token), data: { name: renamed } })
      await expect(page.getByText(renamed)).toBeVisible({ timeout: 15_000 })

      await api.delete(`${API_ROOT}/api/collections/${collectionId}`, { headers: auth(token) })
      collectionId = null
      // Must wait for it to *go*: asserting absence immediately would pass on
      // the pre-refetch render and prove nothing.
      await expect(page.getByText(renamed)).toBeHidden({ timeout: 15_000 })
    } finally {
      if (collectionId) await api.delete(`${API_ROOT}/api/collections/${collectionId}`, { headers: auth(token) }).catch(() => {})
      }
  })

  test('a session closed on another device stops playback here and offers to resume', async ({ page }) => {
    test.setTimeout(90_000)
    const { api, token } = await signInApi(username!, password!)

    await signInBrowser(page, username!, password!)
    const firstBook = page.locator('article a[href*="/item/"]').first()
    await expect(firstBook).toBeVisible({ timeout: 15_000 })
    await firstBook.click()
    await expect(page).toHaveURL(/\/item\//)
    await page.getByRole('button', { name: /^(Play|Resume)$/ }).click()
    await expect(page.getByRole('button', { name: 'Pause' }).last()).toBeVisible({ timeout: 20_000 })

    // Close this listening session from outside the browser, the way another
    // device or an admin would.
    const online = await (await api.get(`${API_ROOT}/api/users/online`, { headers: auth(token) })).json()
    const sessionId = online.usersOnline?.[0]?.session?.id
    expect(sessionId, 'no open playback session found to close').toBeTruthy()
    await api.post(`${API_ROOT}/api/session/${sessionId}/close`, { headers: auth(token), data: {} })

    // The session is dead server-side, so the player must stop rather than keep
    // playing against it — and degrade to the same prompt a reload produces.
    await expect(page.getByText('Playback stopped')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Continue listening?')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0)

  })
})

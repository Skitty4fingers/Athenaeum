import { test, expect, request, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Series reading order (docs/GAP-CLOSURE-PLAN.md lane C1 + C2).
 *
 * Covers the detect half (a banner when sequences are missing or repeated)
 * and the fix half (drag-to-reorder writing sequences 1..N), plus the one
 * correctness property the whole C2 design exists for: a book that belongs to
 * more than one series must keep its other memberships across the write.
 *
 * That last one is not theoretical. The list view this editor opens from is
 * served under `filter=series.<id>`, and the server attaches only the filtered
 * series to each item — so a book in two series looks like it is in one.
 * Writing straight from that data deletes the other membership, because
 * `updateSeriesFromRequest` replaces a book's series list wholesale.
 *
 * Needs E2E_USERNAME / E2E_PASSWORD, like the other specs, and skips cleanly
 * without them.
 *
 * NOTE: mutates the library it runs against — it rewrites sequences for one
 * series and temporarily files one book under an extra series, restoring both
 * afterwards. Use a disposable library, not your real one.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000/audiobookshelf/'
const API_ROOT = new URL(BASE).origin + new URL(BASE).pathname.replace(/\/$/, '')
/** Name for the throwaway series used to prove multi-series preservation. */
const TEMP_SERIES = 'ZZ E2E Temp Series'

interface SeriesRef {
  id: string
  name: string
  sequence: string | null
}

const username = process.env.E2E_USERNAME
const password = process.env.E2E_PASSWORD

function auth(token: string) {
  return { Authorization: `Bearer ${token}` }
}

/** One API sign-in for the file — see the note in live-sync.spec.ts on the auth rate limit. */
let sharedCtx: Promise<{ api: APIRequestContext; token: string; libraryId: string | null }> | null = null

function apiLogin() {
  sharedCtx ??= (async () => {
    const api = await request.newContext()
    const res = await api.post(`${API_ROOT}/login`, { data: { username, password } })
    if (!res.ok()) throw new Error(`API login failed: ${res.status()}${res.status() === 429 ? ' (auth rate limit — wait or restart the server)' : ''}`)
    const body = await res.json()
    return { api, token: body.user.accessToken as string, libraryId: body.userDefaultLibraryId as string | null }
  })()
  return sharedCtx
}

test.afterAll(async () => {
  if (sharedCtx) await (await sharedCtx).api.dispose().catch(() => {})
  sharedCtx = null
})

/** Full series list for a book — only the expanded endpoint carries all of them. */
async function seriesOf(api: APIRequestContext, token: string, itemId: string): Promise<SeriesRef[]> {
  const item = await (await api.get(`${API_ROOT}/api/items/${itemId}?expanded=1`, { headers: auth(token) })).json()
  return item.media?.metadata?.series ?? []
}

async function setSeries(api: APIRequestContext, token: string, itemId: string, series: { name: string; sequence: string | null }[]) {
  await api.patch(`${API_ROOT}/api/items/${itemId}/media`, { headers: auth(token), data: { metadata: { series } } })
}

async function signIn(page: Page) {
  await page.goto('signin')
  await page.getByLabel('Username', { exact: true }).fill(username!)
  await page.getByLabel('Password', { exact: true }).fill(password!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page, 'sign-in did not complete — check credentials and the server auth rate limit').not.toHaveURL(/\/signin/, { timeout: 20_000 })
}

/** First series in the library holding at least two books. */
async function findSeries(api: APIRequestContext, token: string, libraryId: string) {
  const res = await (await api.get(`${API_ROOT}/api/libraries/${libraryId}/series?limit=100`, { headers: auth(token) })).json()
  return (res.results ?? []).find((s: { books?: unknown[] }) => (s.books?.length ?? 0) >= 2) ?? null
}

async function booksInSeries(api: APIRequestContext, token: string, libraryId: string, seriesId: string) {
  const filter = `series.${Buffer.from(seriesId).toString('base64')}`
  const res = await (await api.get(`${API_ROOT}/api/libraries/${libraryId}/items?limit=100&minified=1&sort=sequence&filter=${encodeURIComponent(filter)}`, { headers: auth(token) })).json()
  return (res.results ?? []) as { id: string; media: { metadata: { title: string; series?: SeriesRef } } }[]
}

test.describe('series reading order', () => {
  test.skip(!username || !password, 'Set E2E_USERNAME and E2E_PASSWORD to run this against a real server.')

  test('flags a broken order, then fixes it by dragging — without losing other series', async ({ page }) => {
    test.setTimeout(90_000)
    const { api, token, libraryId: defaultLibrary } = await apiLogin()
    const libs = await (await api.get(`${API_ROOT}/api/libraries`, { headers: auth(token) })).json()
    const libraryId = defaultLibrary ?? libs.libraries[0].id

    const series = await findSeries(api, token, libraryId)
    test.skip(!series, 'No series with two or more books in the library under test.')

    const books = await booksInSeries(api, token, libraryId, series.id)
    const original = new Map<string, SeriesRef[]>()
    for (const b of books) original.set(b.id, await seriesOf(api, token, b.id))

    const [first, second] = books
    try {
      // Break the order: clear one book's sequence, and file the *other* under
      // an extra series so the preservation property has something to protect.
      await setSeries(
        api,
        token,
        second.id,
        (original.get(second.id) ?? []).map((s) => ({ name: s.name, sequence: s.id === series.id ? null : s.sequence }))
      )
      await setSeries(api, token, first.id, [...(original.get(first.id) ?? []).map((s) => ({ name: s.name, sequence: s.sequence })), { name: TEMP_SERIES, sequence: '7' }])

      await signIn(page)
      await page.goto(`series/${series.id}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

      // C1 — the problem is stated on screen, not left silent.
      await expect(page.getByText('Reading order is incomplete')).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(/no position/)).toBeVisible()

      // C2 — reorder by dragging, then save.
      await page.getByRole('button', { name: 'Edit order' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      const handles = page.getByRole('button', { name: /^Reorder / })
      await expect(handles.first()).toBeVisible()
      const before = await handles.first().getAttribute('aria-label')

      // Keyboard drag: deterministic where a synthetic mouse drag is timing
      // sensitive. dnd-kit needs a tick to enter drag mode before it reads
      // arrow keys, so these presses cannot be sent back-to-back.
      await handles.first().focus()
      await page.keyboard.press('Space')
      await page.waitForTimeout(300)
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(300)
      await page.keyboard.press('Space')
      await page.waitForTimeout(500)
      await expect(handles.first(), 'dragging should move a different book to the top').not.toHaveAttribute('aria-label', before ?? '')

      await page.getByRole('button', { name: 'Save order' }).click()
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 })

      // Every book in the series is now numbered 1..N.
      const after = await booksInSeries(api, token, libraryId, series.id)
      expect(after.map((b) => b.media.metadata.series?.sequence)).toEqual(after.map((_, i) => String(i + 1)))

      // The property this design exists for.
      const firstAfter = await seriesOf(api, token, first.id)
      expect(
        firstAfter.map((s) => s.name),
        'reordering must not drop the book’s other series memberships'
      ).toContain(TEMP_SERIES)

      // C1 — and the banner clears once the order is complete.
      await page.reload()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText('Reading order is incomplete')).toBeHidden()
    } finally {
      for (const [id, refs] of original) {
        await setSeries(
          api,
          token,
          id,
          refs.map((s) => ({ name: s.name, sequence: s.sequence }))
        ).catch(() => {})
      }
    }
  })
})

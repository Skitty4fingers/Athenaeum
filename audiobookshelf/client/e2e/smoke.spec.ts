import { test, expect } from '@playwright/test'

/**
 * One real pass over the whole playback loop: sign in, land on the library,
 * open a book, start it playing. Not a broad e2e suite — this is the single
 * path that has to work for VoxSilo to be usable at all, run against a real
 * server and a real library rather than mocked responses.
 *
 * Needs E2E_USERNAME / E2E_PASSWORD for an account on whatever server
 * E2E_BASE_URL (see playwright.config.ts) points at — skips itself with a
 * clear reason if they're not set, rather than failing on missing secrets.
 *
 * Each spec signs in for real, and the server rate-limits authentication (40
 * attempts per 10 minutes by default), so repeated full-suite runs will start
 * failing with "Too many authentication requests". Start the dev server with
 * RATE_LIMIT_AUTH_MAX=0 when iterating on these tests.
 */
test('sign in, browse the library, and start playback', async ({ page }) => {
  const username = process.env.E2E_USERNAME
  const password = process.env.E2E_PASSWORD
  test.skip(!username || !password, 'Set E2E_USERNAME and E2E_PASSWORD to run this against a real server.')

  await page.goto('signin')
  await page.getByLabel('Username', { exact: true }).fill(username!)
  await page.getByLabel('Password', { exact: true }).fill(password!)
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Assert we actually left the sign-in screen before looking for books. That
  // screen renders the app name as its own `h1`, so a heading check alone
  // passes even when sign-in was rejected (a rate limit, say) and the real
  // failure then shows up as a confusing "no book links found".
  await expect(page, 'sign-in did not complete — check credentials and the server auth rate limit').not.toHaveURL(/\/signin/, { timeout: 20_000 })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
  const firstBook = page.locator('article a[href^="/audiobookshelf/item/"]').first()
  await expect(firstBook).toBeVisible()

  await firstBook.click()
  await expect(page).toHaveURL(/\/item\//)

  // "Play" for a book with no progress, "Resume" for one already in progress — either is fine.
  const playButton = page.getByRole('button', { name: /^(Play|Resume)$/ })
  await expect(playButton).toBeVisible()
  await playButton.click()

  // The mini player bar appears once a session starts. Its Pause button and the item page's own
  // Pause toggle both match by accessible name — the player bar is the last one in DOM order
  // (AppShell renders it after the routed page content), so `.last()` disambiguates.
  await expect(page.getByRole('button', { name: 'Pause' }).last()).toBeVisible({ timeout: 15_000 })

  // Leave things as we found them rather than leaving a session running in the background.
  await page.getByRole('button', { name: 'Close player' }).click()
})

import { defineConfig } from '@playwright/test'

/**
 * No `webServer` entry deliberately — a real run needs both the Vite dev
 * server *and* the audiobookshelf Express server (for auth, the library API,
 * and audio streaming), and this repo's own dev workflow is already "two
 * processes, started separately" (see the root README). Assumes both are
 * already running against a real library; there is no seeded/mock backend.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    // Trailing slash matters: Playwright resolves a relative goto() against
    // baseURL with standard URL joining, so a base *without* one drops the
    // "/audiobookshelf" segment entirely (`new URL('signin', '.../audiobookshelf')`
    // resolves to '.../signin', not '.../audiobookshelf/signin') — found by
    // actually running this against the real server, not assumed.
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000/audiobookshelf/',
    trace: 'retain-on-failure',
    // Escape hatch for environments that already ship a Chromium and can't
    // download Playwright's pinned revision (CI images, sandboxes, distro
    // packages). Unset, Playwright resolves its own browser as usual.
    ...(process.env.E2E_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH } } : {})
  }
})

import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Separate from vite.config.ts deliberately — that one's `server`/`build`
 * options (the dev proxy, the base path) have nothing to do with running
 * unit tests, and mixing them risks vitest picking up proxy config that
 * assumes a running server. Shares only the `@/` alias, which source files
 * actually need to resolve.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts']
  }
})

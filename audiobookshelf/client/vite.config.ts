import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The audiobookshelf server mounts every route under a configurable base path
 * (`ROUTER_BASE_PATH`, defaulting to `/audiobookshelf`) and serves this app's
 * build output statically from `client/dist`. Vite's `base` must match, or the
 * emitted asset URLs 404 behind the base path.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.ROUTER_BASE_PATH ?? '/audiobookshelf'
  const target = env.SERVER_URL ?? 'http://localhost:3333'

  // Paths owned by the Express server rather than the SPA. Mirrors the list in
  // the legacy client's nuxt.config.js so dev behaviour matches production.
  const serverPaths = ['api', 'public', 'hls', 'auth', 'feed', 'status', 'login', 'logout', 'init', 'ping']

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') }
    },
    server: {
      port: 3000,
      proxy: {
        ...Object.fromEntries(serverPaths.map((p) => [`${base}/${p}`, { target, changeOrigin: true }])),
        [`${base}/socket.io`]: { target, ws: true, changeOrigin: true }
      }
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: mode !== 'production'
    }
  }
})

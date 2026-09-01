import path from 'node:path'
import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'

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
    plugins: [
      react(),
      tailwindcss(),
      // `ANALYZE=1 npm run build` writes dist/stats.html — a treemap of what
      // is actually inside each chunk. Use it before arguing about bundle size.
      env.ANALYZE ? (visualizer({ filename: 'dist/stats.html', gzipSize: true }) as PluginOption) : null
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') }
    },
    server: {
      port: 3000,
      // Bind every interface, not just localhost, so the dev server is reachable
      // from a phone or tablet on the same LAN for real mobile testing.
      host: true,
      proxy: {
        ...Object.fromEntries(serverPaths.map((p) => [`${base}/${p}`, { target, changeOrigin: true }])),
        [`${base}/socket.io`]: { target, ws: true, changeOrigin: true }
      }
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: mode !== 'production',
      rollupOptions: {
        output: {
          // Only the react runtime is grouped by hand: it is the most stable,
          // most shared code, so it gets its own long-lived cache entry that
          // app-only releases never invalidate. Everything else is left to
          // Rollup's default placement, which puts a dependency in the chunk
          // of its importer — so libraries used only by lazily-loaded routes
          // (dnd-kit, react-dropzone, image-zoom, motion) load with that route
          // instead of upfront. A blanket `node_modules -> vendor` rule here
          // previously forced all of them into the initial payload.
          // Grouping is kept this coarse deliberately: fine-grained
          // manualChunks is how Rollup circular-init crashes happen.
          manualChunks(id) {
            if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
              return 'react-core'
            }
          }
        }
      }
    }
  }
})

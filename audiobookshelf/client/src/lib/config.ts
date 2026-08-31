/**
 * The Express server mounts everything under ROUTER_BASE_PATH (default
 * `/audiobookshelf`) and Vite is configured with the same value as `base`, so
 * `BASE_URL` is the single source of truth for where the server lives. In dev
 * the Vite proxy forwards these paths to localhost:3333, so the app is always
 * same-origin and never needs an absolute server URL.
 */
const rawBase = import.meta.env.BASE_URL || '/'

/** Base path with no trailing slash — `''` when served from the domain root. */
export const basePath = rawBase.replace(/\/+$/, '')

/** Prefix for the authenticated JSON API. */
export const apiPath = `${basePath}/api`

/** Socket.IO mounts at `<base>/socket.io` (see server/SocketAuthority.js). */
export const socketPath = `${basePath}/socket.io`

/**
 * Build-time default app name — baked into `index.html`'s `<title>` via
 * Vite's `%VITE_APP_NAME%` substitution, and used before a session (and its
 * `serverSettings`) has loaded. Set `VITE_APP_NAME` in `client/.env.local`
 * (gitignored — see `client/.env` for the committed default) to change it
 * for everyone who isn't running with an admin-configured override.
 */
export const defaultAppName = import.meta.env.VITE_APP_NAME || 'VoxSilo'

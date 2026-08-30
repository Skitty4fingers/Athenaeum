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

export const appName = 'VoxSilo'

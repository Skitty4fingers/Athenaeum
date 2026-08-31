import { io, type Socket } from 'socket.io-client'
import { basePath } from './config'
import { getAccessToken } from './api'

/**
 * Socket.IO client.
 *
 * The server authenticates sockets out-of-band from the HTTP transport: connect
 * first, then emit `auth` with the access token and wait for `init` (success)
 * or `auth_failed` (see server/SocketAuthority.js#authenticateSocket). Because
 * a fresh reconnect is unauthenticated again, every `connect` re-sends `auth`
 * with whatever token is current at that moment.
 *
 * One socket for the app's lifetime, not tied to any component — consumers
 * subscribe/unsubscribe to specific events rather than each owning a connection.
 */

let socket: Socket | null = null

export function getSocket(): Socket {
  if (socket) return socket

  // The first io() argument is the origin to connect to, not a path prefix —
  // passing basePath there would make socket.io-client treat it as a
  // *namespace* (e.g. io('/audiobookshelf')) instead of a transport path,
  // and silently fail to open the real connection. Omitting it connects to
  // the current origin; `path` is where the base path actually belongs,
  // matching the server's mount point (SocketAuthority.js: `${RouterBasePath}/socket.io`).
  socket = io({
    path: `${basePath}/socket.io`,
    transports: ['websocket', 'polling'],
    autoConnect: true
  })

  socket.on('connect', () => {
    const token = getAccessToken()
    if (token) socket!.emit('auth', token)
  })

  socket.on('auth_failed', (payload: { message?: string }) => {
    console.warn('[socket] auth failed:', payload?.message)
  })

  return socket
}

/**
 * Re-sends auth on the current socket without waiting for a reconnect —
 * needed right after login, when the socket may already be connected (e.g.
 * from a prior session on the same tab) but unauthenticated.
 */
export function reauthSocket() {
  const token = getAccessToken()
  if (token && socket?.connected) socket.emit('auth', token)
}

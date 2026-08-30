import { apiPath, basePath } from './config'
import type { LoginResponse } from '@/types/abs'

/**
 * Thin fetch wrapper around the audiobookshelf API.
 *
 * Auth model (see server/Auth.js): `POST /login` returns a short-lived access
 * token in the body and sets a long-lived `refresh_token` httpOnly cookie. The
 * access token is deliberately held in memory only — persisting it to
 * localStorage would trade the cookie's XSS protection away for nothing, since
 * the cookie can silently re-mint a session on reload anyway.
 */

let accessToken: string | null = null

/** Notified when a refresh fails and the session is genuinely over. */
type SessionEndedHandler = () => void
let onSessionEnded: SessionEndedHandler = () => {}

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

export function setSessionEndedHandler(handler: SessionEndedHandler) {
  onSessionEnded = handler
}

export class ApiError extends Error {
  status: number
  body?: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function errorMessage(status: number, body: unknown): string {
  if (typeof body === 'string' && body.trim()) return body
  if (body && typeof body === 'object' && 'error' in body) {
    const { error } = body as { error?: unknown }
    if (typeof error === 'string') return error
  }
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 403) return 'You do not have permission to do that.'
  if (status === 404) return 'Not found.'
  return `Request failed (${status})`
}

/**
 * A single in-flight refresh shared by all callers. Without this, a page that
 * fires several queries at once would kick off one refresh per 401 and race —
 * each rotating the refresh token and invalidating the others.
 */
let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${basePath}/auth/refresh`, {
        method: 'POST',
        credentials: 'include'
      })
      if (!res.ok) return null
      const data = (await res.json()) as LoginResponse
      const token = data.user?.accessToken ?? null
      accessToken = token
      return token
    } catch {
      return null
    } finally {
      // Cleared in a microtask so concurrent callers all observe this promise.
      queueMicrotask(() => {
        refreshInFlight = null
      })
    }
  })()

  return refreshInFlight
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Set false for endpoints outside `/api` that must not carry a bearer token. */
  auth?: boolean
  /** Internal: prevents infinite refresh recursion. */
  _retried?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, _retried = false, headers, ...rest } = options

  const finalHeaders = new Headers(headers)
  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders.set('Content-Type', 'application/json')
  }
  if (auth && accessToken) {
    finalHeaders.set('Authorization', `Bearer ${accessToken}`)
  }

  const res = await fetch(path, {
    ...rest,
    headers: finalHeaders,
    credentials: 'include',
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)
  })

  // A 401 on an authenticated call means the access token aged out. Mint a new
  // one from the refresh cookie and replay the request exactly once.
  if (res.status === 401 && auth && !_retried) {
    const token = await refreshAccessToken()
    if (token) {
      return request<T>(path, { ...options, _retried: true })
    }
    accessToken = null
    onSessionEnded()
  }

  if (!res.ok) {
    const errBody = await parseBody(res)
    throw new ApiError(res.status, errorMessage(res.status, errBody), errBody)
  }

  if (res.status === 204) return null as T
  return (await parseBody(res)) as T
}

/** Authenticated JSON API under `<base>/api`. */
export const api = {
  get: <T>(path: string, init?: RequestOptions) => request<T>(`${apiPath}${path}`, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: unknown, init?: RequestOptions) => request<T>(`${apiPath}${path}`, { ...init, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, init?: RequestOptions) => request<T>(`${apiPath}${path}`, { ...init, method: 'PATCH', body }),
  delete: <T>(path: string, init?: RequestOptions) => request<T>(`${apiPath}${path}`, { ...init, method: 'DELETE' })
}

/** Auth endpoints live at the base path, outside `/api`. */
export const authApi = {
  login: (username: string, password: string) =>
    request<LoginResponse>(`${basePath}/login`, {
      method: 'POST',
      body: { username, password },
      auth: false
    }),

  /** Resumes a session from the refresh cookie. Returns null when there is none. */
  async restore(): Promise<LoginResponse | null> {
    try {
      const res = await fetch(`${basePath}/auth/refresh`, { method: 'POST', credentials: 'include' })
      if (!res.ok) return null
      const data = (await res.json()) as LoginResponse
      accessToken = data.user?.accessToken ?? null
      return data
    } catch {
      return null
    }
  },

  async logout() {
    try {
      await request(`${basePath}/logout`, { method: 'POST' })
    } finally {
      accessToken = null
    }
  }
}

/**
 * Cover image URL. The server exempts `/items/:id/cover` from auth
 * (server/Auth.js ignorePatterns), so plain `<img src>` works without a
 * bearer token. `ts` busts the cache when artwork is replaced.
 */
export function coverUrl(itemId: string, opts: { width?: number; height?: number; ts?: number } = {}) {
  const params = new URLSearchParams()
  if (opts.width) params.set('width', String(opts.width))
  if (opts.height) params.set('height', String(opts.height))
  if (opts.ts) params.set('ts', String(opts.ts))
  const qs = params.toString()
  return `${apiPath}/items/${itemId}/cover${qs ? `?${qs}` : ''}`
}

import { create } from 'zustand'
import { api, authApi, setAccessToken, setSessionEndedHandler } from '@/lib/api'
import { reauthSocket } from '@/lib/socket'
import { defaultAppName } from '@/lib/config'
import type { LoginResponse, MediaProgress, ServerSettings, User } from '@/types/abs'

type AuthStatus = 'idle' | 'restoring' | 'authenticated' | 'unauthenticated'

interface AuthState {
  status: AuthStatus
  user: User | null
  serverSettings: ServerSettings | null
  defaultLibraryId: string | null
  /** Error from the most recent explicit sign-in attempt. */
  error: string | null

  restore: () => Promise<void>
  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  /** Admin-only. PATCHes `/settings` and applies the server's response so every reader (sidebar, tab title, sign-in screen) picks up the change immediately. */
  updateServerSettings: (patch: Partial<ServerSettings>) => Promise<void>
  /**
   * Patches one book's progress record in place. `user.mediaProgress` is what
   * the sidebar counts, Continue Listening, and grid progress bars all read —
   * none of that is React Query state, so a query-cache invalidation after a
   * finished/unread mutation does not touch it. `progress: null` removes the
   * record (unread); otherwise it replaces or adds it.
   */
  setMediaProgress: (libraryItemId: string, progress: MediaProgress | null) => void
}

function applySession(data: LoginResponse) {
  setAccessToken(data.user.accessToken ?? null)
  // A socket from a previous unauthenticated state (or a stale token) needs a
  // fresh `auth` emit — a plain reconnect won't happen since it's already connected.
  reauthSocket()
  return {
    status: 'authenticated' as const,
    user: data.user,
    serverSettings: data.serverSettings,
    defaultLibraryId: data.userDefaultLibraryId,
    error: null
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  user: null,
  serverSettings: null,
  defaultLibraryId: null,
  error: null,

  /**
   * Attempts to resume a session from the httpOnly refresh cookie. Runs once at
   * startup so a reload does not force a fresh sign-in.
   */
  async restore() {
    set({ status: 'restoring' })
    const data = await authApi.restore()
    if (!data) {
      set({ status: 'unauthenticated', user: null, serverSettings: null, defaultLibraryId: null })
      return
    }
    set(applySession(data))
  },

  async login(username, password) {
    set({ error: null })
    try {
      const data = await authApi.login(username, password)
      set(applySession(data))
      return true
    } catch (err) {
      // The server answers a bad credential with a bare 401, so prefer a clear
      // message over echoing the generic session-expired copy from the client.
      const message = err instanceof Error && 'status' in err && (err as { status: number }).status === 401 ? 'Incorrect username or password.' : err instanceof Error ? err.message : 'Sign in failed.'
      set({ status: 'unauthenticated', error: message })
      return false
    }
  },

  async logout() {
    await authApi.logout()
    set({ status: 'unauthenticated', user: null, serverSettings: null, defaultLibraryId: null, error: null })
  },

  setMediaProgress(libraryItemId, progress) {
    const { user } = get()
    if (!user) return
    const withoutItem = user.mediaProgress.filter((mp) => !(mp.libraryItemId === libraryItemId && !mp.episodeId))
    set({ user: { ...user, mediaProgress: progress ? [...withoutItem, progress] : withoutItem } })
  },

  async updateServerSettings(patch) {
    const { serverSettings } = await api.patch<{ serverSettings: ServerSettings }>('/settings', patch)
    set({ serverSettings })
  }
}))

// A refresh failure anywhere in the app (not just at startup) ends the session.
setSessionEndedHandler(() => {
  setAccessToken(null)
  useAuthStore.setState({ status: 'unauthenticated', user: null, serverSettings: null, defaultLibraryId: null })
})

/**
 * The admin-configurable app name, falling back to the build-time default
 * before a session loads (or when no override is set). For React components;
 * use `getAppName()` outside of render (e.g. store actions).
 */
export function useAppName() {
  return useAuthStore((s) => s.serverSettings?.customAppName || defaultAppName)
}

/** Same as `useAppName()`, but callable outside React — reads the store directly. */
export function getAppName() {
  return useAuthStore.getState().serverSettings?.customAppName || defaultAppName
}

import { create } from 'zustand'
import { authApi, setAccessToken, setSessionEndedHandler } from '@/lib/api'
import type { LoginResponse, ServerSettings, User } from '@/types/abs'

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
}

function applySession(data: LoginResponse) {
  setAccessToken(data.user.accessToken ?? null)
  return {
    status: 'authenticated' as const,
    user: data.user,
    serverSettings: data.serverSettings,
    defaultLibraryId: data.userDefaultLibraryId,
    error: null
  }
}

export const useAuthStore = create<AuthState>((set) => ({
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
  }
}))

// A refresh failure anywhere in the app (not just at startup) ends the session.
setSessionEndedHandler(() => {
  setAccessToken(null)
  useAuthStore.setState({ status: 'unauthenticated', user: null, serverSettings: null, defaultLibraryId: null })
})

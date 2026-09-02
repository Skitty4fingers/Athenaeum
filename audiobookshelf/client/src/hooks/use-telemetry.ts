import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { OnlineUsersResponse, SessionsPage } from '@/types/abs'

/**
 * Admin activity data.
 *
 * Nothing here is new tracking: the server already records last-seen, holds open
 * playback sessions in memory, and counts socket connections per user. These are
 * its existing admin endpoints, surfaced instead of left to `curl`.
 *
 * Both queries are kept fresh two ways. `lib/socket-sync.ts` invalidates them on
 * `user_online` / `user_offline` / `user_stream_update` (admin-only events), which
 * covers connect, disconnect and stream changes. A slow poll backstops the parts
 * no event announces — a session's position advances every 15s with no socket
 * event of its own, so without it "listening now" would freeze mid-book.
 */

const ONLINE_POLL_MS = 20_000

export function useOnlineUsers(enabled = true) {
  return useQuery({
    queryKey: ['users-online'],
    enabled,
    queryFn: () => api.get<OnlineUsersResponse>('/users/online'),
    refetchInterval: enabled ? ONLINE_POLL_MS : false,
    // Presence is worth re-reading whenever an admin returns to the tab.
    staleTime: 0
  })
}

export function useRecentSessions(limit = 20, enabled = true) {
  return useQuery({
    queryKey: ['recent-sessions', limit],
    enabled,
    queryFn: () => api.get<SessionsPage>(`/sessions?itemsPerPage=${limit}&page=0&sort=updatedAt&desc=1`),
    staleTime: 30_000
  })
}

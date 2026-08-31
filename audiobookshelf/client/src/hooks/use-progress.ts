import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import type { MediaProgress } from '@/types/abs'

/**
 * Manual finished/unread toggling.
 *
 * These deliberately use different mechanisms, both read straight from the
 * server's own merge logic (server/models/MediaProgress.js#applyProgressUpdate)
 * rather than reimplemented here:
 *
 * - Marking finished is a `PATCH {isFinished: true}`. On an existing record
 *   this only flips the flag and sets progress to 1 — it does not touch
 *   currentTime, so a book jumped straight to "finished" keeps whatever
 *   position it had. That is correct: someone marking a book they read
 *   elsewhere isn't lying about their playback position.
 * - Marking unread is a full `DELETE` of the progress row, not
 *   `PATCH {isFinished: false}`. The server's merge logic only resets
 *   currentTime/progress to zero when flipping *out of* an already-finished
 *   state — sending `isFinished: false` against an in-progress (unfinished)
 *   record is a no-op for position. Deleting is the one action that reliably
 *   means "not started" from either state.
 *
 * Both then patch `useAuthStore`'s `user.mediaProgress` directly. That array
 * is what the sidebar counts, Continue Listening, and grid progress bars all
 * read, and none of it is React Query state — invalidating query caches alone
 * would leave those stale until the next login/restore.
 */

function invalidate(queryClient: ReturnType<typeof useQueryClient>, itemId: string) {
  void queryClient.invalidateQueries({ queryKey: ['item', itemId] })
  void queryClient.invalidateQueries({ queryKey: ['library-items'] })
  void queryClient.invalidateQueries({ queryKey: ['items-in-progress'] })
}

export function useMarkFinished(itemId: string | undefined) {
  const queryClient = useQueryClient()
  const setMediaProgress = useAuthStore((s) => s.setMediaProgress)

  return useMutation({
    mutationFn: async () => {
      await api.patch(`/me/progress/${itemId}`, { isFinished: true })
      // PATCH returns no body (see MeController.createUpdateMediaProgress), so
      // fetch the record back — this is also how we learn its real id, needed
      // if the user immediately marks it unread again in the same session.
      return api.get<MediaProgress>(`/me/progress/${itemId}`)
    },
    onSuccess: (progress) => {
      if (!itemId) return
      setMediaProgress(itemId, progress)
      invalidate(queryClient, itemId)
    }
  })
}

export function useMarkUnread(itemId: string | undefined) {
  const queryClient = useQueryClient()
  const setMediaProgress = useAuthStore((s) => s.setMediaProgress)

  return useMutation({
    mutationFn: (mediaProgressId: string) => api.delete(`/me/progress/${mediaProgressId}`),
    onSuccess: () => {
      if (!itemId) return
      setMediaProgress(itemId, null)
      invalidate(queryClient, itemId)
    }
  })
}

/** The current user's whole-book progress record, if one exists. */
export function useMediaProgressFor(itemId: string | undefined): MediaProgress | undefined {
  const mediaProgress = useAuthStore((s) => s.user?.mediaProgress)
  return mediaProgress?.find((mp) => mp.libraryItemId === itemId && !mp.episodeId)
}

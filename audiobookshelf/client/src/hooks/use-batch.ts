import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import type { ItemMetadataPayload } from './use-item-edit'
import type { MediaProgress } from '@/types/abs'

function invalidateLibrary(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['library-items'] })
  void queryClient.invalidateQueries({ queryKey: ['items-in-progress'] })
  void queryClient.invalidateQueries({ queryKey: ['library-filterdata'] })
  void queryClient.invalidateQueries({ queryKey: ['library-stats'] })
}

export function useBatchAddToCollection(collectionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (libraryItemIds: string[]) => api.post(`/collections/${collectionId}/batch/add`, { books: libraryItemIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collections'] })
      void queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
    }
  })
}

export function useBatchAddToPlaylist(playlistId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (libraryItemIds: string[]) => api.post(`/playlists/${playlistId}/batch/add`, { items: libraryItemIds.map((libraryItemId) => ({ libraryItemId })) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
      void queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] })
    }
  })
}

/**
 * `PATCH /me/progress/batch/update` (`server/controllers/MeController.js`).
 * Fast path for the shared case, but its response is empty — the auth
 * store's `user.mediaProgress` (what the sidebar counts and grid progress
 * bars actually read) won't reflect the change until something re-fetches
 * it, so this follows up with one `GET` per item, same as the single-item
 * `useMarkFinished` hook.
 */
export function useBatchMarkFinished() {
  const queryClient = useQueryClient()
  const setMediaProgress = useAuthStore((s) => s.setMediaProgress)

  return useMutation({
    mutationFn: async (libraryItemIds: string[]) => {
      await api.patch('/me/progress/batch/update', libraryItemIds.map((libraryItemId) => ({ libraryItemId, isFinished: true })))
      const results = await Promise.all(libraryItemIds.map((id) => api.get<MediaProgress>(`/me/progress/${id}`)))
      return results
    },
    onSuccess: (results, libraryItemIds) => {
      results.forEach((progress, i) => setMediaProgress(libraryItemIds[i], progress))
      invalidateLibrary(queryClient)
    }
  })
}

/**
 * No batch equivalent of "mark unread" exists server-side — the single-item
 * flow is a `DELETE` of the progress row (see `useMarkUnread`), and deletion
 * isn't something the batch *update* endpoint can express. This loops the
 * same per-item delete instead of pretending there's a real batch call.
 */
export function useBatchMarkUnread() {
  const queryClient = useQueryClient()
  const setMediaProgress = useAuthStore((s) => s.setMediaProgress)
  const mediaProgress = useAuthStore((s) => s.user?.mediaProgress)

  return useMutation({
    mutationFn: async (libraryItemIds: string[]) => {
      const toDelete = libraryItemIds.map((id) => ({ id, progressId: mediaProgress?.find((mp) => mp.libraryItemId === id && !mp.episodeId)?.id })).filter((x): x is { id: string; progressId: string } => Boolean(x.progressId))
      await Promise.all(toDelete.map((x) => api.delete(`/me/progress/${x.progressId}`)))
      return toDelete.map((x) => x.id)
    },
    onSuccess: (clearedIds) => {
      clearedIds.forEach((id) => setMediaProgress(id, null))
      invalidateLibrary(queryClient)
    }
  })
}

export function useBatchDeleteItems() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (libraryItemIds: string[]) => api.post('/items/batch/delete', { libraryItemIds }),
    onSuccess: () => invalidateLibrary(queryClient)
  })
}

/** Direct pass-through to `POST /items/batch/update` — callers compute each item's full payload (see `ItemMetadataPayload`) since the server replaces arrays wholesale rather than merging. */
export function useBatchUpdateMetadata() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (updates: { id: string; mediaPayload: ItemMetadataPayload }[]) => api.post<{ success: boolean; updates: number }>('/items/batch/update', updates),
    onSuccess: () => invalidateLibrary(queryClient)
  })
}

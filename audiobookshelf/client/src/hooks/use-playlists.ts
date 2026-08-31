import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Playlist } from '@/types/abs'

/**
 * `server/controllers/PlaylistController.js`. Personal — ownership-checked
 * server-side, no permission gate, so every signed-in user (including
 * guests) manages their own. Audiobooks only, so every item carries just a
 * `libraryItemId` — no `episodeId`, unlike the podcast-shaped variant the
 * server also supports.
 */
export function usePlaylists(libraryId: string | undefined) {
  return useQuery({
    queryKey: ['playlists', libraryId],
    enabled: Boolean(libraryId),
    queryFn: () => api.get<{ results: Playlist[] }>(`/libraries/${libraryId}/playlists`),
    select: (data) => data.results
  })
}

export function usePlaylist(playlistId: string | undefined) {
  return useQuery({
    queryKey: ['playlist', playlistId],
    enabled: Boolean(playlistId),
    queryFn: () => api.get<Playlist>(`/playlists/${playlistId}`)
  })
}

function invalidatePlaylist(queryClient: ReturnType<typeof useQueryClient>, playlistId?: string) {
  void queryClient.invalidateQueries({ queryKey: ['playlists'] })
  if (playlistId) void queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] })
}

export function useCreatePlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { libraryId: string; name: string; description?: string; libraryItemId: string }) => api.post<Playlist>('/playlists', { libraryId: input.libraryId, name: input.name, description: input.description, items: [{ libraryItemId: input.libraryItemId }] }),
    onSuccess: () => invalidatePlaylist(queryClient)
  })
}

export function useUpdatePlaylist(playlistId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name?: string; description?: string }) => api.patch<Playlist>(`/playlists/${playlistId}`, input),
    onSuccess: () => invalidatePlaylist(queryClient, playlistId)
  })
}

/** Full replace — `libraryItemIds` is the complete desired order of every item already in the playlist. */
export function useReorderPlaylist(playlistId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (libraryItemIds: string[]) => api.patch<Playlist>(`/playlists/${playlistId}`, { items: libraryItemIds.map((libraryItemId) => ({ libraryItemId })) }),
    onSuccess: () => invalidatePlaylist(queryClient, playlistId)
  })
}

/**
 * The batch endpoint, not the singular `POST /playlists/:id/item` — a
 * server-side doc comment notes the singular route "is not used by Abs web
 * client or mobile apps", so batch (even for one item) matches the contract
 * the server is actually exercised against.
 */
export function useAddItemToPlaylist(playlistId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (libraryItemId: string) => api.post<Playlist>(`/playlists/${playlistId}/batch/add`, { items: [{ libraryItemId }] }),
    onSuccess: () => invalidatePlaylist(queryClient, playlistId)
  })
}

export function useRemoveItemFromPlaylist(playlistId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (libraryItemId: string) => api.post<Playlist>(`/playlists/${playlistId}/batch/remove`, { items: [{ libraryItemId }] }),
    onSuccess: () => invalidatePlaylist(queryClient, playlistId)
  })
}

export function useDeletePlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (playlistId: string) => api.delete(`/playlists/${playlistId}`),
    onSuccess: () => invalidatePlaylist(queryClient)
  })
}

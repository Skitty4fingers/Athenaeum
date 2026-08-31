import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AudioBookmark } from '@/types/abs'

/**
 * `server/controllers/MeController.js`. A bookmark is identified by the pair
 * (libraryItemId, time) — there's no separate id — so renaming means calling
 * create again at the same time (the server updates the title in place), and
 * removing needs the exact time back in the URL.
 */
export function useBookmarksForItem(itemId: string | undefined) {
  return useQuery({
    queryKey: ['bookmarks', itemId],
    enabled: Boolean(itemId),
    queryFn: () => api.get<{ bookmarks: AudioBookmark[] }>(`/me/bookmarks/${itemId}`),
    select: (data) => [...data.bookmarks].sort((a, b) => a.time - b.time)
  })
}

export function useCreateBookmark(itemId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ time, title }: { time: number; title: string }) => api.post<AudioBookmark>(`/me/item/${itemId}/bookmark`, { time, title }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['bookmarks', itemId] })
  })
}

export function useDeleteBookmark(itemId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (time: number) => api.delete(`/me/item/${itemId}/bookmark/${time}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['bookmarks', itemId] })
  })
}

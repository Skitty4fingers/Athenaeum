import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Chapter } from '@/stores/player'

/**
 * `POST /items/:id/chapters` is a full replace, not a per-chapter patch — the
 * whole array is submitted every time (see
 * server/controllers/LibraryItemController.js#updateMediaChapters). Sending a
 * partial list deletes the rest.
 */
export function useUpdateChapters(itemId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (chapters: Pick<Chapter, 'title' | 'start' | 'end'>[]) => api.post(`/items/${itemId}/chapters`, { chapters }),
    onSuccess: () => {
      if (!itemId) return
      void queryClient.invalidateQueries({ queryKey: ['item', itemId] })
    }
  })
}

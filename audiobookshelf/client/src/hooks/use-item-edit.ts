import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/**
 * Payload for `PATCH /api/items/:id/media`. Two things worth knowing before
 * touching this (see server/models/Book.js#updateFromRequest and
 * server/controllers/LibraryItemController.js#updateMedia):
 *
 * - `tags` is top-level, everything else book-related is under `metadata`.
 *   Easy to miss since almost every other field lives in one place.
 * - `authors`/`series` are matched and created *by name* server-side
 *   (`updateAuthorsFromRequest`/`updateSeriesFromRequest`), not by id — so
 *   renaming "J.R.R Tolkien" to "J.R.R. Tolkien" here creates a new author
 *   record rather than editing the existing one. Fixing a typo needs the
 *   correct final name typed once, not an in-place rename.
 */
export interface ItemMetadataPayload {
  metadata: {
    title?: string | null
    subtitle?: string | null
    authors?: { name: string }[]
    narrators?: string[]
    series?: { name: string; sequence?: string | null }[]
    genres?: string[]
    publishedYear?: string | null
    publishedDate?: string | null
    publisher?: string | null
    description?: string | null
    isbn?: string | null
    asin?: string | null
    language?: string | null
    explicit?: boolean
    abridged?: boolean
  }
  tags?: string[]
}

export function useUpdateItemMetadata(itemId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ItemMetadataPayload) => api.patch(`/items/${itemId}/media`, payload),
    onSuccess: () => {
      if (!itemId) return
      void queryClient.invalidateQueries({ queryKey: ['item', itemId] })
      void queryClient.invalidateQueries({ queryKey: ['library-items'] })
      void queryClient.invalidateQueries({ queryKey: ['library-series'] })
      void queryClient.invalidateQueries({ queryKey: ['library-filterdata'] })
      void queryClient.invalidateQueries({ queryKey: ['library-stats'] })
    }
  })
}

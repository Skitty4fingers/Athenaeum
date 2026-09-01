import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withSequenceForSeries } from '@/lib/series'
import type { BookSeriesRef } from '@/types/abs'

/**
 * Rewrites reading order for one series (docs/GAP-CLOSURE-PLAN.md lane C2).
 *
 * Two server behaviours shape this, both verified against a running server
 * rather than assumed:
 *
 * 1. `updateSeriesFromRequest` replaces a book's series list **wholesale** —
 *    any series missing from the payload is removed from the book. So the
 *    payload has to carry every series the book belongs to, not just the one
 *    being reordered.
 * 2. The list view this editor opens from cannot supply that. Under a
 *    `filter=series.<id>` query the server attaches only the *filtered*
 *    series to `metadata.series` (libraryItemsBookFilters.js sets
 *    `libraryItem.series` from the filtered include). A book in two series
 *    looks like it is in one.
 *
 * Writing straight from the list data therefore silently deletes the book's
 * other series memberships. Each book's full series list is re-read from the
 * expanded item endpoint first, and only the target series' sequence is
 * changed.
 *
 * Series are matched by *name* server-side, not id, so the payload sends
 * names — see `ItemMetadataPayload` in use-item-edit.ts.
 */

interface ExpandedItemSeries {
  media?: { metadata?: { series?: BookSeriesRef[] } }
}

export interface SeriesReorderResult {
  /** Books whose sequence actually changed. Zero means the order already matched. */
  updated: number
}

/** Positions are 1-based and written as strings, the form the server stores. */
export function sequenceForPosition(index: number): string {
  return String(index + 1)
}

export function useReorderSeries(seriesId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation<SeriesReorderResult, Error, string[]>({
    mutationFn: async (orderedItemIds) => {
      if (!seriesId) throw new Error('No series to reorder.')

      // Read-before-write: the list view cannot tell us a book's other series.
      const items = await Promise.all(orderedItemIds.map((id) => api.get<ExpandedItemSeries>(`/items/${id}?expanded=1`)))

      const updates = orderedItemIds
        .map((id, index) => {
          const allSeries = items[index]?.media?.metadata?.series ?? []
          const target = allSeries.find((s) => s.id === seriesId)
          // A book that no longer belongs to this series (removed in another
          // tab between opening the dialog and saving) is skipped rather than
          // silently re-added under a new membership.
          if (!target) return null

          const sequence = sequenceForPosition(index)
          if ((target.sequence ?? '') === sequence) return null

          return {
            id,
            mediaPayload: {
              metadata: {
                series: withSequenceForSeries(allSeries, (s) => s.id === seriesId, sequence)
              }
            }
          }
        })
        .filter((update): update is NonNullable<typeof update> => update !== null)

      if (!updates.length) return { updated: 0 }

      await api.post('/items/batch/update', updates)
      return { updated: updates.length }
    },

    onSuccess: () => {
      // The batch endpoint emits `items_updated`, which lib/socket-sync.ts
      // already turns into these same invalidations for every other open tab.
      // This covers the tab that issued the write, whose own event may race
      // the mutation settling.
      void queryClient.invalidateQueries({ queryKey: ['series-books'] })
      void queryClient.invalidateQueries({ queryKey: ['library-series'] })
      void queryClient.invalidateQueries({ queryKey: ['library-items'] })
    }
  })
}

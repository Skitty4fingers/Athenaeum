import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { LibraryItemMinified } from '@/types/abs'

/** Fetches just enough to render the "Continue listening" prompt — title, author, cover. */
export function useResumeItem(itemId: string | null) {
  return useQuery({
    queryKey: ['resume-item', itemId],
    enabled: Boolean(itemId),
    queryFn: () => api.get<LibraryItemMinified>(`/items/${itemId}`),
    retry: false
  })
}

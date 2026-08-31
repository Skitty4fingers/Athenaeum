import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/**
 * Providers audiobookshelf can search for a cover (server/finders/BookFinder.js).
 * `best` and `all` are findCovers-only aggregates, not real providers.
 */
export const COVER_PROVIDERS = [
  { value: 'best', label: 'Best (Google, FantLab, Audible)' },
  { value: 'all', label: 'All providers' },
  { value: 'google', label: 'Google Books' },
  { value: 'audible', label: 'Audible' },
  { value: 'itunes', label: 'iTunes' },
  { value: 'openlibrary', label: 'Open Library' },
  { value: 'fantlab', label: 'FantLab' },
  { value: 'audiobookcovers', label: 'AudiobookCovers' }
] as const

function invalidateItem(queryClient: ReturnType<typeof useQueryClient>, itemId: string) {
  void queryClient.invalidateQueries({ queryKey: ['item', itemId] })
  void queryClient.invalidateQueries({ queryKey: ['library-items'] })
}

export function useCoverSearch(title: string, author: string, provider: string, enabled: boolean) {
  return useQuery({
    queryKey: ['cover-search', title, author, provider],
    enabled: enabled && title.trim().length > 0,
    queryFn: () => {
      const params = new URLSearchParams({ title: title.trim(), provider })
      if (author.trim()) params.set('author', author.trim())
      return api.get<{ results: string[] }>(`/search/covers?${params}`)
    },
    select: (data) => data.results,
    staleTime: 5 * 60_000,
    retry: false
  })
}

export function useSetCoverFromUrl(itemId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (url: string) => api.post(`/items/${itemId}/cover`, { url }),
    onSuccess: () => itemId && invalidateItem(queryClient, itemId)
  })
}

export function useUploadCoverFile(itemId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.set('cover', file)
      return api.post(`/items/${itemId}/cover`, formData)
    },
    onSuccess: () => itemId && invalidateItem(queryClient, itemId)
  })
}

export function useRemoveCover(itemId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete(`/items/${itemId}/cover`),
    onSuccess: () => itemId && invalidateItem(queryClient, itemId)
  })
}

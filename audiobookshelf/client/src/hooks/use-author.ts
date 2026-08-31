import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AuthorDetail } from '@/types/abs'

/** `include=items` also accepts `series` to get a grouped-by-series shape, but a flat book grid is all the author page needs. */
export function useAuthor(authorId: string | undefined) {
  return useQuery({
    queryKey: ['author', authorId],
    enabled: Boolean(authorId),
    queryFn: () => api.get<AuthorDetail>(`/authors/${authorId}?include=items`)
  })
}

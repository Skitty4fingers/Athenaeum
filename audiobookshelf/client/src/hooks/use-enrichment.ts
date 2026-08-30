import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/**
 * Metadata enrichment via audiobookshelf's custom metadata provider bridge.
 *
 * The Open Library service in `services/openlibrary-provider` implements the
 * provider contract; audiobookshelf proxies to it and normalises the response,
 * so this client only ever talks to audiobookshelf.
 */

export interface MetadataProvider {
  id: string
  name: string
  mediaType: string
  url: string
}

/** A candidate returned by a provider, already normalised by audiobookshelf. */
export interface MetadataMatch {
  title?: string
  subtitle?: string
  author?: string
  narrator?: string
  publisher?: string
  publishedYear?: string
  description?: string
  cover?: string
  isbn?: string
  asin?: string
  genres?: string[]
  tags?: string[]
  series?: { series: string; sequence?: string }[]
  language?: string
  duration?: number
}

/**
 * Providers audiobookshelf ships with (see BookFinder.js). Audible is listed
 * first because it is the only source that knows about narrators and audiobook
 * series numbering — exactly the fields Libation's ID3 tags get wrong.
 */
export const BUILTIN_PROVIDERS = [
  { slug: 'audible', name: 'Audible' },
  { slug: 'audible.uk', name: 'Audible UK' },
  { slug: 'audible.de', name: 'Audible DE' },
  { slug: 'audible.fr', name: 'Audible FR' },
  { slug: 'google', name: 'Google Books' },
  { slug: 'openlibrary', name: 'Open Library (built-in)' },
  { slug: 'itunes', name: 'iTunes' },
  { slug: 'fantlab', name: 'FantLab' }
] as const

/** Registered custom providers — the built-ins need no registration. */
export function useMetadataProviders() {
  return useQuery({
    queryKey: ['metadata-providers'],
    queryFn: () => api.get<{ providers: MetadataProvider[] }>('/custom-metadata-providers'),
    select: (data) => data.providers,
    staleTime: 5 * 60_000
  })
}

interface MatchArgs {
  itemId: string | undefined
  /** Provider slug: a built-in name, or `custom-<id>` for a registered service. */
  provider: string | undefined
  title: string | undefined
  author?: string | null
  enabled: boolean
}

export function useMetadataMatches({ itemId, provider, title, author, enabled }: MatchArgs) {
  return useQuery({
    queryKey: ['metadata-matches', provider, title, author ?? null],
    enabled: enabled && Boolean(provider && title),
    queryFn: () => {
      const params = new URLSearchParams({
        provider: provider!,
        title: title!
      })
      if (author) params.set('author', author)
      if (itemId) params.set('id', itemId)
      return api.get<MetadataMatch[]>(`/search/books?${params}`)
    },
    // Upstream lookups are slow and rate-limited; do not refetch casually.
    staleTime: 10 * 60_000,
    retry: false
  })
}

export function useApplyMetadata(itemId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (metadata: Record<string, unknown>) => api.patch(`/items/${itemId}/media`, { metadata }),
    onSuccess: () => {
      // The grid, sidebar counts and series lists can all shift after an edit.
      void queryClient.invalidateQueries({ queryKey: ['item', itemId] })
      void queryClient.invalidateQueries({ queryKey: ['library-items'] })
      void queryClient.invalidateQueries({ queryKey: ['library-series'] })
      void queryClient.invalidateQueries({ queryKey: ['library-filterdata'] })
      void queryClient.invalidateQueries({ queryKey: ['library-stats'] })
    }
  })
}

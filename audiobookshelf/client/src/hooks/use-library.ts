import { useMemo } from 'react'
import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { encodeFilter } from '@/lib/filters'
import type { ItemInProgress, Library, LibraryFilterData, LibraryItemMinified, LibraryItemsPage, LibrarySeries, LibraryStats } from '@/types/abs'

/** Page size for the library grid. Large enough that most screens fill in one request. */
export const PAGE_SIZE = 48

export const SORT_OPTIONS = [
  { value: 'media.metadata.title', label: 'Title' },
  { value: 'media.metadata.authorNameLF', label: 'Author' },
  { value: 'addedAt', label: 'Date added' },
  { value: 'media.metadata.publishedYear', label: 'Publish year' },
  { value: 'media.duration', label: 'Duration' },
  { value: 'size', label: 'Size' }
] as const

export type SortValue = (typeof SORT_OPTIONS)[number]['value']

export function useLibraries() {
  return useQuery({
    queryKey: ['libraries'],
    queryFn: () => api.get<{ libraries: Library[] }>('/libraries'),
    select: (data) => data.libraries.sort((a, b) => a.displayOrder - b.displayOrder),
    staleTime: 5 * 60_000
  })
}

/**
 * VoxSilo is a single-library app, so most surfaces just want "the" library
 * rather than a list. Falls back to the first library if the user has no
 * default set.
 */
export function useCurrentLibrary(preferredId?: string) {
  const query = useLibraries()
  const library = query.data?.find((l) => l.id === preferredId) ?? query.data?.[0]
  return { ...query, library }
}

interface LibraryItemsArgs {
  libraryId: string | undefined
  sort: SortValue
  desc: boolean
  filter?: string | null
  /** Collapse each series into a single representative card. */
  collapseSeries?: boolean
}

export function useLibraryItems({ libraryId, sort, desc, filter, collapseSeries = false }: LibraryItemsArgs) {
  return useInfiniteQuery({
    queryKey: ['library-items', libraryId, sort, desc, filter ?? null, collapseSeries],
    enabled: Boolean(libraryId),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        page: String(pageParam),
        sort,
        desc: desc ? '1' : '0',
        minified: '1'
      })
      if (filter) params.set('filter', filter)
      if (collapseSeries) params.set('collapseseries', '1')
      return api.get<LibraryItemsPage>(`/libraries/${libraryId}/items?${params}`)
    },
    getNextPageParam: (lastPage) => {
      // The server echoes back page/limit; there is more only if this page was full
      // and we have not yet accounted for `total`.
      const consumed = (lastPage.page + 1) * lastPage.limit
      return consumed < lastPage.total ? lastPage.page + 1 : undefined
    }
  })
}

interface SearchMatch {
  libraryItem: LibraryItemMinified
  matchKey: string | null
  matchText: string | null
}

export interface LibrarySearchResults {
  book?: SearchMatch[]
  podcast?: SearchMatch[]
  narrators?: { name: string; numBooks: number }[]
  tags?: { name: string; numItems: number }[]
  genres?: { name: string; numItems: number }[]
  series?: { series: { id: string; name: string }; books: LibraryItemMinified[] }[]
  authors?: { id: string; name: string; numBooks: number }[]
}

export function useLibrarySearch(libraryId: string | undefined, query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['library-search', libraryId, trimmed],
    // One-character queries match nearly everything and cost a full table scan.
    enabled: Boolean(libraryId) && trimmed.length >= 2,
    queryFn: () => api.get<LibrarySearchResults>(`/libraries/${libraryId}/search?q=${encodeURIComponent(trimmed)}&limit=36`),
    staleTime: 60_000
  })
}

/** Genres, narrators, decades and authors present in the library — drives the sidebar. */
export function useFilterData(libraryId: string | undefined) {
  return useQuery({
    queryKey: ['library-filterdata', libraryId],
    enabled: Boolean(libraryId),
    queryFn: () => api.get<LibraryFilterData>(`/libraries/${libraryId}/filterdata`),
    staleTime: 5 * 60_000
  })
}

export function useLibraryStats(libraryId: string | undefined) {
  return useQuery({
    queryKey: ['library-stats', libraryId],
    enabled: Boolean(libraryId),
    queryFn: () => api.get<LibraryStats>(`/libraries/${libraryId}/stats`),
    staleTime: 5 * 60_000
  })
}

/** Books with saved progress, most recently listened first. */
export function useItemsInProgress(limit = 4) {
  return useQuery({
    queryKey: ['items-in-progress', limit],
    queryFn: () => api.get<{ libraryItems: ItemInProgress[] }>(`/me/items-in-progress?limit=${limit}`),
    select: (data) => data.libraryItems,
    staleTime: 30_000
  })
}

/** All series in the library, with their books, for the sidebar and series views. */
export function useLibrarySeries(libraryId: string | undefined) {
  return useQuery({
    queryKey: ['library-series', libraryId],
    enabled: Boolean(libraryId),
    queryFn: () => api.get<{ results: LibrarySeries[]; total: number }>(`/libraries/${libraryId}/series?limit=100&include=progress`),
    select: (data) => data.results,
    staleTime: 5 * 60_000
  })
}

/**
 * Books in one series, in reading order.
 *
 * `sort=sequence` is only honoured alongside a `series.*` filter — the server
 * needs the join to sort on it — so the two always travel together.
 */
export function useSeriesBooks(libraryId: string | undefined, seriesId: string | undefined) {
  return useQuery({
    queryKey: ['series-books', libraryId, seriesId],
    enabled: Boolean(libraryId && seriesId),
    queryFn: () => {
      const params = new URLSearchParams({
        limit: '100',
        minified: '1',
        sort: 'sequence',
        filter: encodeFilter('series', seriesId!)
      })
      return api.get<LibraryItemsPage>(`/libraries/${libraryId}/items?${params}`)
    },
    select: (data) => data.results
  })
}

/**
 * Expands `/search`'s categorized matches into an actual grid of books.
 *
 * The search endpoint is built for a picker (see CommandPalette): it returns
 * `book` matches as full items, but author/narrator/genre matches are just
 * `{name, numBooks}` — a count, not the books. A search box that renders a
 * book grid needs the books, so for every non-book category match this fires
 * a normal filtered `/items` request (the same one the sidebar's filter links
 * use) and merges the results in, deduped by item id.
 *
 * This is why searching "king" finds every Stephen King book even though no
 * title contains "king" — the match came from `authors`, not `book`.
 */
export function useSearchResultItems(libraryId: string | undefined, query: string) {
  const search = useLibrarySearch(libraryId, query)
  const results = search.data

  const authorFilters = results?.authors?.map((a) => encodeFilter('authors', a.id)) ?? []
  const narratorFilters = results?.narrators?.map((n) => encodeFilter('narrators', n.name)) ?? []
  const genreFilters = results?.genres?.map((g) => encodeFilter('genres', g.name)) ?? []
  const expandFilters = [...authorFilters, ...narratorFilters, ...genreFilters]

  const expandQueries = useQueries({
    queries: expandFilters.map((filter) => ({
      queryKey: ['library-items', libraryId, 'search-expand', filter],
      enabled: Boolean(libraryId),
      queryFn: () => api.get<LibraryItemsPage>(`/libraries/${libraryId}/items?limit=50&minified=1&filter=${encodeURIComponent(filter)}`),
      staleTime: 60_000
    }))
  })

  const isPending = search.isPending || (expandFilters.length > 0 && expandQueries.some((q) => q.isPending))

  const items = useMemo(() => {
    if (!results) return []
    const byId = new Map<string, LibraryItemMinified>()

    for (const match of [...(results.book ?? []), ...(results.podcast ?? [])]) {
      byId.set(match.libraryItem.id, match.libraryItem)
    }
    for (const seriesMatch of results.series ?? []) {
      for (const book of seriesMatch.books ?? []) byId.set(book.id, book)
    }
    for (const q of expandQueries) {
      for (const item of q.data?.results ?? []) byId.set(item.id, item)
    }

    return [...byId.values()]
  }, [results, expandQueries])

  return { items, isPending }
}

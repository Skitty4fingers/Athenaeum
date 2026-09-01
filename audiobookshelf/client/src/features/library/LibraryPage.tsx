import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ArrowDownAZ, ArrowUpAZ, CheckSquare, Layers, LibraryBig, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/kibo-ui/spinner'
import { BookCard, BookCardSkeleton } from './BookCard'
import { SeriesCard } from './SeriesCard'
import { BatchActionBar } from './BatchActionBar'
import { UploadDialog } from './UploadDialog'
import { PAGE_SIZE, SORT_OPTIONS, useFilterData, useLibraries, useLibraryItems, useSearchResultItems, type SortValue } from '@/hooks/use-library'
import { useAuthStore } from '@/stores/auth'
import { decodeFilter, filterLabel } from '@/lib/filters'
import { usePlayerStore } from '@/stores/player'

const GRID_CLASS = 'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7'

/** Debounces a value so typing does not fire a request per keystroke. */
function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function LibraryPage() {
  const { libraryId: routeLibraryId } = useParams<{ libraryId: string }>()
  const defaultLibraryId = useAuthStore((s) => s.defaultLibraryId)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.type === 'root' || user?.type === 'admin'
  const { data: libraries } = useLibraries()

  // The bare /library route has no id; fall back to the user's default, then the first available.
  const libraryId = routeLibraryId ?? defaultLibraryId ?? libraries?.[0]?.id
  const library = libraries?.find((l) => l.id === libraryId)

  const [sort, setSort] = useState<SortValue>('media.metadata.title')
  const [desc, setDesc] = useState(false)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounced(query)
  const isSearching = debouncedQuery.trim().length >= 2

  // The active filter lives in the URL so the sidebar can drive the grid and
  // the view stays shareable and back-button friendly.
  const playItem = usePlayerStore((s) => s.play)
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = searchParams.get('filter')

  // The `authors` filter encodes an author *id*, unlike every other group
  // (genres, narrators, progress) which encode human-readable text — see
  // server/utils/queries/libraryItemsBookFilters.js. filterLabel() has no
  // server data to resolve an id from, so the name lookup happens here.
  // Uses filterdata's full author list, not stats' authorsWithCount — that
  // one is a server-side top-10-by-book-count list (a real bug, found live:
  // filtering to an 11th+ author showed a raw UUID as the page heading
  // instead of their name, since they simply weren't in the top 10).
  const { data: filterData } = useFilterData(libraryId)
  const decodedFilter = decodeFilter(filter)
  const activeFilterLabel = decodedFilter?.group === 'authors' ? (filterData?.authors.find((a) => a.id === decodedFilter.value)?.name ?? 'Author') : filterLabel(filter)

  // Collapsing is meaningless while searching (search bypasses the items
  // endpoint) or when already filtered down to one series.
  const groupSeries = searchParams.get('group') === 'series'
  const canGroupSeries = !isSearching && !filter?.startsWith('series.')

  function toggleGroupSeries() {
    const params = new URLSearchParams(searchParams)
    if (groupSeries) params.delete('group')
    else params.set('group', 'series')
    setSearchParams(params, { replace: true })
  }

  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Reset view state when switching libraries so filters do not leak across them.
  useEffect(() => {
    setQuery('')
    setSort('media.metadata.title')
    setDesc(false)
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [libraryId])

  function toggleSelectMode() {
    setSelectMode((v) => !v)
    setSelectedIds(new Set())
  }
  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearFilter() {
    const params = new URLSearchParams(searchParams)
    params.delete('filter')
    setSearchParams(params, { replace: true })
  }

  const itemsQuery = useLibraryItems({ libraryId, sort, desc, filter, collapseSeries: groupSeries && canGroupSeries })
  const search = useSearchResultItems(libraryId, debouncedQuery)

  /** Progress is served with the user record, so index it once per render pass. */
  const progressByItem = useMemo(() => {
    const map = new Map<string, { progress: number; isFinished: boolean }>()
    for (const mp of user?.mediaProgress ?? []) {
      // Episode-level progress would overwrite the book entry; keep whole-item rows only.
      if (mp.episodeId) continue
      map.set(mp.libraryItemId, { progress: mp.progress, isFinished: mp.isFinished })
    }
    return map
  }, [user?.mediaProgress])

  const browseItems = useMemo(() => itemsQuery.data?.pages.flatMap((p) => p.results) ?? [], [itemsQuery.data])

  const items = isSearching ? search.items : browseItems

  // Infinite scroll: observe a sentinel below the grid.
  const sentinelRef = useRef<HTMLDivElement>(null)
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = itemsQuery
  useEffect(() => {
    if (isSearching || !hasNextPage) return
    const node = sentinelRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '600px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [isSearching, hasNextPage, isFetchingNextPage, fetchNextPage])

  const total = itemsQuery.data?.pages[0]?.total ?? 0
  const isInitialLoading = isSearching ? search.isPending : itemsQuery.isPending
  const showEmpty = !isInitialLoading && items.length === 0

  const resultLabel = `${items.length} result${items.length === 1 ? '' : 's'} for "${debouncedQuery.trim()}"`
  const totalLabel = `${total.toLocaleString()} item${total === 1 ? '' : 's'}`

  return (
    <div className={`mx-auto w-full max-w-[120rem] px-4 py-6 sm:px-6 lg:px-8 ${selectMode && selectedIds.size > 0 ? 'pb-20' : ''}`}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{activeFilterLabel ?? library?.name ?? 'Library'}</h1>
            {activeFilterLabel && !isSearching && (
              <Button variant="secondary" size="sm" onClick={clearFilter} className="h-7 gap-1.5 rounded-full px-2.5 text-xs">
                Clear filter
                <X className="size-3" />
              </Button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{isSearching ? resultLabel : total > 0 ? totalLabel : 'Browse your collection'}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="relative flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter this library..." aria-label="Search library" className="pl-9 pr-9" />
            {query && (
              <Button variant="ghost" size="icon" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground">
                <X className="size-3.5" />
              </Button>
            )}
          </div>

          <Select value={sort} onValueChange={(v) => setSort(v as SortValue)} disabled={isSearching}>
            <SelectTrigger className="w-[9.5rem]" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" disabled={isSearching} onClick={() => setDesc((v) => !v)} aria-label={desc ? 'Sort ascending' : 'Sort descending'} title={desc ? 'Descending' : 'Ascending'}>
            {desc ? <ArrowUpAZ className="size-4" /> : <ArrowDownAZ className="size-4" />}
          </Button>

          <Button
            variant={groupSeries && canGroupSeries ? 'default' : 'outline'}
            size="icon"
            disabled={!canGroupSeries || selectMode}
            onClick={toggleGroupSeries}
            aria-pressed={groupSeries && canGroupSeries}
            aria-label="Group books by series"
            title={groupSeries ? 'Showing series as single cards' : 'Group books by series'}
          >
            <Layers className="size-4" />
          </Button>

          <Button
            variant={selectMode ? 'default' : 'outline'}
            size="icon"
            disabled={groupSeries && canGroupSeries}
            onClick={toggleSelectMode}
            aria-pressed={selectMode}
            aria-label={selectMode ? 'Exit selection mode' : 'Select multiple books'}
            title={selectMode ? 'Done selecting' : 'Select multiple'}
          >
            <CheckSquare className="size-4" />
          </Button>

          {isAdmin && <UploadDialog />}
        </div>
      </div>

      {isInitialLoading && (
        <div className={GRID_CLASS}>
          {Array.from({ length: PAGE_SIZE / 2 }).map((_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      )}

      {showEmpty && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-24 text-center">
          <LibraryBig className="mb-3 size-9 text-muted-foreground/60" />
          <p className="font-medium">{isSearching ? 'No matches' : activeFilterLabel ? `Nothing in ${activeFilterLabel}` : 'This library is empty'}</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{isSearching ? 'Try a different title, author, or narrator.' : activeFilterLabel ? 'No books match this filter yet.' : 'Add files to the library folder, then run a scan from the server.'}</p>
          {activeFilterLabel && !isSearching && (
            <Button variant="outline" size="sm" className="mt-4" onClick={clearFilter}>
              Show all books
            </Button>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className={GRID_CLASS}>
          {items.map((item) => {
            // With collapsing on, the server marks the representative item of
            // each series; those render as a stacked series card instead.
            if (item.collapsedSeries) return <SeriesCard key={`series-${item.collapsedSeries.id}`} item={item} />
            const progress = progressByItem.get(item.id)
            return (
              <BookCard
                key={item.id}
                item={item}
                progress={progress?.progress ?? 0}
                isFinished={progress?.isFinished ?? false}
                onPlay={selectMode ? undefined : (book) => void playItem(book)}
                selection={selectMode ? { selected: selectedIds.has(item.id), onToggle: () => toggleSelected(item.id) } : undefined}
              />
            )
          })}
        </div>
      )}

      {!isSearching && (
        <div ref={sentinelRef} className="flex justify-center py-10">
          {isFetchingNextPage && <Spinner variant="ring" size={24} className="text-muted-foreground" />}
        </div>
      )}

      {selectMode && <BatchActionBar selectedItems={items.filter((i) => selectedIds.has(i.id))} onClearSelection={() => setSelectedIds(new Set())} />}
    </div>
  )
}

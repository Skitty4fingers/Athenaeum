import { useMemo } from 'react'
import { Link, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, AudioLines, BookOpen, CheckCircle2, Circle, Clock, FolderHeart, Headphones, Layers, Library as LibraryIcon, ListMusic, Mic, PlayCircle, Tag, User } from 'lucide-react'

import { cn } from '@/lib/utils'
import { coverUrl } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppName, useAuthStore } from '@/stores/auth'
import { useCurrentLibrary, useFilterData, useItemsInProgress, useLibrarySeries, useLibraryStats } from '@/hooks/use-library'
import { useCollections } from '@/hooks/use-collections'
import { usePlaylists } from '@/hooks/use-playlists'
import { encodeFilter } from '@/lib/filters'
import { CollapsibleFilterSection } from './CollapsibleFilterSection'
import type { BookMediaMinified, ItemInProgress } from '@/types/abs'

/**
 * VoxSilo has exactly one library, so a list of libraries would be a nav item
 * that never changes. This rail spends that space on the things that do change:
 * what you are part-way through, and the filters that actually narrow the grid.
 */

/** Cap on how many entries a collapsible filter section shows before scrolling. */
const MAX_FILTER_ENTRIES = 20

interface SidebarProps {
  onNavigate?: () => void
}

function itemTitle(item: ItemInProgress) {
  return item.media.metadata.title ?? 'Untitled'
}

function itemAuthor(item: ItemInProgress) {
  if (item.mediaType === 'podcast') return null
  return (item.media as BookMediaMinified).metadata.authorName || null
}

/** A compact in-progress row: cover, title, author, and a thin progress bar. */
function ContinueRow({ item, progress, onNavigate }: { item: ItemInProgress; progress: number; onNavigate?: () => void }) {
  const title = itemTitle(item)
  const author = itemAuthor(item)

  return (
    <Link to={`/item/${item.id}`} onClick={onNavigate} className="group flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-sidebar-accent/60">
      <div className="relative size-11 shrink-0 overflow-hidden rounded-md bg-muted">
        <img src={coverUrl(item.id, { width: 96, ts: item.updatedAt })} alt="" loading="lazy" className="size-full object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
          <PlayCircle className="size-5 text-white" />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium leading-tight" title={title}>
          {title}
        </p>
        {author && <p className="truncate text-[11px] leading-tight text-muted-foreground">{author}</p>}
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-playing" style={{ width: `${Math.min(Math.max(progress * 100, 2), 100)}%` }} />
        </div>
      </div>
    </Link>
  )
}

/** A filter entry. Active state is driven by the `filter` search param. */
function FilterLink({ label, count, icon: Icon, filter, onNavigate }: { label: string; count?: number; icon: React.ElementType; filter: string | null; onNavigate?: () => void }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { libraryId } = useParams<{ libraryId: string }>()
  const active = (searchParams.get('filter') ?? null) === filter

  function apply() {
    const params = new URLSearchParams(searchParams)
    if (filter) params.set('filter', filter)
    else params.delete('filter')
    navigate({ pathname: libraryId ? `/library/${libraryId}` : '/library', search: params.toString() ? `?${params}` : '' })
    onNavigate?.()
  }

  return (
    <button
      type="button"
      onClick={apply}
      aria-current={active ? 'page' : undefined}
      className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors', active ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground')}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
      {count !== undefined && <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground/70">{count}</span>}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 pb-1.5 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">{children}</p>
}

export function SidebarContent({ onNavigate }: SidebarProps) {
  const { libraryId } = useParams<{ libraryId: string }>()
  const appName = useAppName()
  const defaultLibraryId = useAuthStore((s) => s.defaultLibraryId)
  const user = useAuthStore((s) => s.user)
  const { library } = useCurrentLibrary(libraryId ?? defaultLibraryId ?? undefined)

  const { data: stats } = useLibraryStats(library?.id)
  const { data: filterData } = useFilterData(library?.id)
  const { data: inProgress, isPending: inProgressPending } = useItemsInProgress(4)
  const { data: seriesList } = useLibrarySeries(library?.id)
  const { data: collections } = useCollections(library?.id)
  const { data: playlists } = usePlaylists(library?.id)

  /**
   * Progress counts come from the user record rather than extra filtered
   * requests — it is already loaded, and recomputing here keeps the counts in
   * step with playback without a refetch.
   */
  const progressCounts = useMemo(() => {
    const rows = (user?.mediaProgress ?? []).filter((mp) => !mp.episodeId)
    const finished = rows.filter((mp) => mp.isFinished).length
    const started = rows.filter((mp) => !mp.isFinished && mp.progress > 0).length
    const total = stats?.totalItems ?? 0
    return { total, finished, started, notStarted: Math.max(total - finished - started, 0) }
  }, [user?.mediaProgress, stats?.totalItems])

  const progressById = useMemo(() => {
    const map = new Map<string, number>()
    for (const mp of user?.mediaProgress ?? []) {
      if (!mp.episodeId) map.set(mp.libraryItemId, mp.progress)
    }
    return map
  }, [user?.mediaProgress])

  const genres = useMemo(() => {
    // `stats.genresWithCount` only lists genres that currently have books, while
    // `filterdata.genres` is cached server-side for 30 minutes and can still
    // name genres whose last book was removed. Prefer stats as the source of
    // truth so we never offer a filter that returns nothing.
    // Deliberately unlimited — this is a real library's actual genre list
    // (117 on the dev library), not a "top N" widget, and there's no "view
    // all genres" page to send someone to if it were capped.
    if (stats?.genresWithCount?.length) {
      return [...stats.genresWithCount].sort((a, b) => b.count - a.count).map(({ genre, count }) => ({ genre, count }))
    }
    return (filterData?.genres ?? []).map((genre) => ({ genre, count: undefined as number | undefined }))
  }, [filterData?.genres, stats?.genresWithCount])

  // `stats.authorsWithCount` is a server-side *top 10 by book count* stat
  // (`LibraryController.js#stats`, hardcoded), not the full author list — a
  // real bug found live: a household with more than 10 authors couldn't see
  // or filter by most of them from the sidebar, and filtering to one of the
  // missing ones directly showed a raw UUID as the page heading instead of
  // their name (see LibraryPage's activeFilterLabel). `filterdata.authors`
  // has every author with a real id and no cap; the tradeoff is no per-author
  // book count, which narrators never had either.
  const authors = useMemo(() => [...(filterData?.authors ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [filterData?.authors])

  // Stats has no per-narrator count (unlike genres), so this is a plain
  // alphabetical list from filterdata rather than a "top N by count" one.
  // Also deliberately unlimited, for the same reason as genres above.
  const narrators = useMemo(() => [...(filterData?.narrators ?? [])].sort((a, b) => a.localeCompare(b)), [filterData?.narrators])

  const showContinue = inProgressPending || (inProgress?.length ?? 0) > 0

  return (
    <div className="flex h-full flex-col py-4">
      <Link to="/" onClick={onNavigate} className="mb-2 flex items-center gap-2.5 px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <AudioLines className="size-4.5" strokeWidth={2.25} />
        </div>
        <span className="text-base font-semibold tracking-tight">{appName}</span>
      </Link>

      {/* min-h-0 is load-bearing: a flex item defaults to min-height:auto, so
          without it "flex-1" alone would let this grow to fit all content —
          e.g. every filter section expanded at once — instead of clipping to
          the available height and scrolling internally. */}
      <ScrollArea className="min-h-0 flex-1 px-3 scrollbar-slim">
        {showContinue && (
          <section>
            <SectionLabel>Continue listening</SectionLabel>
            {inProgressPending ? (
              <div className="space-y-1.5 px-1.5">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                {inProgress?.map((item) => (
                  <ContinueRow key={item.id} item={item} progress={progressById.get(item.id) ?? 0} onNavigate={onNavigate} />
                ))}
              </div>
            )}
          </section>
        )}

        <section>
          <SectionLabel>Browse</SectionLabel>
          <div className="space-y-0.5">
            <FilterLink label="All books" icon={BookOpen} filter={null} count={progressCounts.total || undefined} onNavigate={onNavigate} />
            <FilterLink label="In progress" icon={Headphones} filter={encodeFilter('progress', 'in-progress')} count={progressCounts.started} onNavigate={onNavigate} />
            <FilterLink label="Not started" icon={Circle} filter={encodeFilter('progress', 'not-started')} count={progressCounts.notStarted} onNavigate={onNavigate} />
            <FilterLink label="Finished" icon={CheckCircle2} filter={encodeFilter('progress', 'finished')} count={progressCounts.finished} onNavigate={onNavigate} />
          </div>
        </section>

        {!!seriesList?.length && (
          <CollapsibleFilterSection label="Series" icon={Layers} count={seriesList.length}>
            {seriesList
              .slice()
              .sort((a, b) => (b.books?.length ?? 0) - (a.books?.length ?? 0))
              .map((series) => (
                <NavLink
                  key={series.id}
                  to={`/series/${series.id}`}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors', isActive ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground')
                  }
                >
                  <Layers className="size-4 shrink-0" />
                  <span className="truncate">{series.name}</span>
                  {!!series.books?.length && <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground/70">{series.books.length}</span>}
                </NavLink>
              ))}
          </CollapsibleFilterSection>
        )}

        {genres.length > 0 && (
          <CollapsibleFilterSection label="Genres" icon={Tag} count={genres.length}>
            {genres.map(({ genre, count }) => (
              <FilterLink key={genre} label={genre} icon={Tag} filter={encodeFilter('genres', genre)} count={count} onNavigate={onNavigate} />
            ))}
          </CollapsibleFilterSection>
        )}

        {authors.length > 0 && (
          <CollapsibleFilterSection label="Authors" icon={User} count={authors.length}>
            {authors.map((author) => (
              <NavLink
                key={author.id}
                to={`/author/${author.id}`}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors', isActive ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground')
                }
              >
                <User className="size-4 shrink-0" />
                <span className="truncate">{author.name}</span>
              </NavLink>
            ))}
          </CollapsibleFilterSection>
        )}

        {narrators.length > 0 && (
          <CollapsibleFilterSection label="Narrators" icon={Mic} count={narrators.length}>
            {narrators.map((narrator) => (
              <FilterLink key={narrator} label={narrator} icon={Mic} filter={encodeFilter('narrators', narrator)} onNavigate={onNavigate} />
            ))}
          </CollapsibleFilterSection>
        )}

        {!!collections?.length && (
          <CollapsibleFilterSection label="Collections" icon={FolderHeart} count={collections.length}>
            <NavLink to="/collections" onClick={onNavigate} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-foreground">
              <ArrowRight className="size-4 shrink-0" />
              <span>View all</span>
            </NavLink>
            {collections.slice(0, MAX_FILTER_ENTRIES).map((collection) => (
              <NavLink
                key={collection.id}
                to={`/collections/${collection.id}`}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors', isActive ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground')
                }
              >
                <FolderHeart className="size-4 shrink-0" />
                <span className="truncate">{collection.name}</span>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground/70">{collection.books.length}</span>
              </NavLink>
            ))}
          </CollapsibleFilterSection>
        )}

        {!!playlists?.length && (
          <CollapsibleFilterSection label="Playlists" icon={ListMusic} count={playlists.length}>
            <NavLink to="/playlists" onClick={onNavigate} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-foreground">
              <ArrowRight className="size-4 shrink-0" />
              <span>View all</span>
            </NavLink>
            {playlists.slice(0, MAX_FILTER_ENTRIES).map((playlist) => (
              <NavLink
                key={playlist.id}
                to={`/playlists/${playlist.id}`}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors', isActive ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground')
                }
              >
                <ListMusic className="size-4 shrink-0" />
                <span className="truncate">{playlist.name}</span>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground/70">{playlist.items.length}</span>
              </NavLink>
            ))}
          </CollapsibleFilterSection>
        )}

        <div className="h-4" />
      </ScrollArea>

      {stats && (
        <div className="mt-2 space-y-1 border-t px-5 pt-3 text-[11px] text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <LibraryIcon className="size-3.5 shrink-0" />
            <span className="tabular-nums">{stats.totalItems.toLocaleString()}</span> book{stats.totalItems === 1 ? '' : 's'}
            <span aria-hidden>·</span>
            <span className="tabular-nums">{stats.totalAuthors.toLocaleString()}</span> author{stats.totalAuthors === 1 ? '' : 's'}
          </p>
          <p className="flex items-center gap-1.5">
            <Clock className="size-3.5 shrink-0" />
            <span className="tabular-nums">{formatDuration(stats.totalDuration)}</span> total
          </p>
        </div>
      )}
    </div>
  )
}

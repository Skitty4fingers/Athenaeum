import { useMemo } from 'react'
import { Link, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AudioLines, BookOpen, CheckCircle2, Circle, Clock, Headphones, Layers, Library as LibraryIcon, PlayCircle, Tag } from 'lucide-react'

import { cn } from '@/lib/utils'
import { appName } from '@/lib/config'
import { coverUrl } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/stores/auth'
import { useCurrentLibrary, useFilterData, useItemsInProgress, useLibrarySeries, useLibraryStats } from '@/hooks/use-library'
import { encodeFilter } from '@/lib/filters'
import type { BookMediaMinified, ItemInProgress } from '@/types/abs'

/**
 * VoxSilo has exactly one library, so a list of libraries would be a nav item
 * that never changes. This rail spends that space on the things that do change:
 * what you are part-way through, and the filters that actually narrow the grid.
 */

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
  const defaultLibraryId = useAuthStore((s) => s.defaultLibraryId)
  const user = useAuthStore((s) => s.user)
  const { library } = useCurrentLibrary(libraryId ?? defaultLibraryId ?? undefined)

  const { data: stats } = useLibraryStats(library?.id)
  const { data: filterData } = useFilterData(library?.id)
  const { data: inProgress, isPending: inProgressPending } = useItemsInProgress(4)
  const { data: seriesList } = useLibrarySeries(library?.id)

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
    if (stats?.genresWithCount?.length) {
      return [...stats.genresWithCount]
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
        .map(({ genre, count }) => ({ genre, count }))
    }
    return (filterData?.genres ?? []).slice(0, 8).map((genre) => ({ genre, count: undefined as number | undefined }))
  }, [filterData?.genres, stats?.genresWithCount])

  const showContinue = inProgressPending || (inProgress?.length ?? 0) > 0

  return (
    <div className="flex h-full flex-col py-4">
      <Link to="/" onClick={onNavigate} className="mb-2 flex items-center gap-2.5 px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <AudioLines className="size-4.5" strokeWidth={2.25} />
        </div>
        <span className="text-base font-semibold tracking-tight">{appName}</span>
      </Link>

      <ScrollArea className="flex-1 px-3 scrollbar-slim">
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
          <section>
            <SectionLabel>Series</SectionLabel>
            <div className="space-y-0.5">
              {seriesList
                .slice()
                .sort((a, b) => (b.books?.length ?? 0) - (a.books?.length ?? 0))
                .slice(0, 8)
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
            </div>
          </section>
        )}

        {genres.length > 0 && (
          <section>
            <SectionLabel>Genres</SectionLabel>
            <div className="space-y-0.5">
              {genres.map(({ genre, count }) => (
                <FilterLink key={genre} label={genre} icon={Tag} filter={encodeFilter('genres', genre)} count={count} onNavigate={onNavigate} />
              ))}
            </div>
          </section>
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

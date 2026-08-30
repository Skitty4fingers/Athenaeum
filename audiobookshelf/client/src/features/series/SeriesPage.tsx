import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Layers } from 'lucide-react'

import { useAuthStore } from '@/stores/auth'
import { usePlayerStore } from '@/stores/player'
import { useCurrentLibrary, useLibrarySeries, useSeriesBooks } from '@/hooks/use-library'
import { formatDuration } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { BookCard, BookCardSkeleton } from '@/features/library/BookCard'
import type { BookMediaMinified, BookSeriesRef, LibraryItemMinified } from '@/types/abs'

const GRID_CLASS = 'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'

/**
 * Pulls this series' sequence off an item. When a `series.*` filter is active
 * the server attaches a `series` object (or an array when the book belongs to
 * several), so pick the entry matching the series being viewed.
 */
function sequenceFor(item: LibraryItemMinified, seriesId: string): string | null {
  if (item.mediaType !== 'book') return null
  const series = (item.media as BookMediaMinified).metadata.series
  if (!series) return null
  const refs: BookSeriesRef[] = Array.isArray(series) ? series : [series]
  return refs.find((s) => s.id === seriesId)?.sequence ?? null
}

export function SeriesPage() {
  const { seriesId } = useParams<{ seriesId: string }>()
  const defaultLibraryId = useAuthStore((s) => s.defaultLibraryId)
  const user = useAuthStore((s) => s.user)
  const { library } = useCurrentLibrary(defaultLibraryId ?? undefined)
  const playItem = usePlayerStore((s) => s.play)

  const { data: allSeries } = useLibrarySeries(library?.id)
  const { data: books, isPending, isError } = useSeriesBooks(library?.id, seriesId)

  const series = allSeries?.find((s) => s.id === seriesId)

  const progressByItem = useMemo(() => {
    const map = new Map<string, { progress: number; isFinished: boolean }>()
    for (const mp of user?.mediaProgress ?? []) {
      if (mp.episodeId) continue
      map.set(mp.libraryItemId, { progress: mp.progress, isFinished: mp.isFinished })
    }
    return map
  }, [user?.mediaProgress])

  const totalDuration = useMemo(() => (books ?? []).reduce((sum, item) => sum + ((item.media as BookMediaMinified).duration ?? 0), 0), [books])

  const finishedCount = (books ?? []).filter((b) => progressByItem.get(b.id)?.isFinished).length

  return (
    <div className="mx-auto w-full max-w-[120rem] px-4 py-6 sm:px-6 lg:px-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5 gap-1.5 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Library
        </Link>
      </Button>

      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Layers className="size-4" />
          Series
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{series?.name ?? 'Series'}</h1>
        {books && books.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {books.length} book{books.length === 1 ? '' : 's'}
            {totalDuration > 0 && <> · {formatDuration(totalDuration)}</>}
            {finishedCount > 0 && (
              <>
                {' '}
                · {finishedCount} finished
              </>
            )}
          </p>
        )}
      </div>

      {isPending && (
        <div className={GRID_CLASS}>
          {Array.from({ length: 6 }).map((_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && <p className="text-sm text-muted-foreground">Couldn't load this series.</p>}

      {books && books.length === 0 && <p className="text-sm text-muted-foreground">This series has no books.</p>}

      {books && books.length > 0 && (
        <div className={GRID_CLASS}>
          {books.map((item) => {
            const progress = progressByItem.get(item.id)
            return <BookCard key={item.id} item={item} sequence={sequenceFor(item, seriesId!)} progress={progress?.progress ?? 0} isFinished={progress?.isFinished ?? false} onPlay={(book) => void playItem(book)} />
          })}
        </div>
      )}
    </div>
  )
}

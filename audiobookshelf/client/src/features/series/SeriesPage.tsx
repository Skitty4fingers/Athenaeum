import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Layers, ListX } from 'lucide-react'

import { useAuthStore } from '@/stores/auth'
import { usePlayerStore } from '@/stores/player'
import { useCurrentLibrary, useLibrarySeries, useSeriesBooks } from '@/hooks/use-library'
import { formatDuration } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { BookCard, BookCardSkeleton } from '@/features/library/BookCard'
import { SeriesOrderDialog } from './SeriesOrderDialog'
import { analyzeSeriesOrder, describeSeriesOrder } from '@/lib/series'
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
  // Mirrors the server's own gate on the write this enables —
  // LibraryItemController#batchUpdate checks `canUpdate`, not admin status.
  const canUpdate = useAuthStore((s) => Boolean(s.user?.permissions.update))
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

  // Reading order is only as good as the sequences the scanner found; books
  // added without a metadata.json fall back to ID3 tags that are routinely
  // missing or repeated. Surface that where someone is already looking at the
  // order, instead of leaving the series silently shuffled.
  const orderHealth = useMemo(() => analyzeSeriesOrder((books ?? []).map((item) => sequenceFor(item, seriesId!))), [books, seriesId])
  const orderProblem = describeSeriesOrder(orderHealth)

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

      {books && books.length > 1 && (orderProblem || canUpdate) && (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            {orderProblem && <ListX className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            <div className="text-sm">
              {orderProblem ? (
                <>
                  <p className="font-medium">Reading order is incomplete</p>
                  <p className="text-muted-foreground">{orderProblem}</p>
                </>
              ) : (
                <p className="text-muted-foreground">Reading order looks complete.</p>
              )}
            </div>
          </div>
          {canUpdate && <SeriesOrderDialog seriesId={seriesId!} seriesName={series?.name ?? 'Series'} books={books} />}
        </div>
      )}

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

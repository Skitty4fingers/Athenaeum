import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BookOpen, CalendarDays, Clock, Layers, ListTree, Mic, Pause, Play, Sparkles } from 'lucide-react'

import { api, coverUrl } from '@/lib/api'
import { formatBytes, formatDuration } from '@/lib/format'
import { encodeFilter } from '@/lib/filters'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Pill } from '@/components/kibo-ui/pill'
import { EnrichDialog } from './EnrichDialog'
import { usePlayerStore } from '@/stores/player'
import type { BookMediaMinified, BookSeriesRef, LibraryItemMinified, MediaProgress } from '@/types/abs'

interface ExpandedItem extends LibraryItemMinified {
  userMediaProgress?: MediaProgress | null
}

function useItem(itemId: string | undefined) {
  return useQuery({
    queryKey: ['item', itemId],
    enabled: Boolean(itemId),
    queryFn: () => api.get<ExpandedItem>(`/items/${itemId}?expanded=1&include=progress`)
  })
}

function Fact({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm">{value}</p>
      </div>
    </div>
  )
}

export function ItemPage() {
  const { itemId } = useParams<{ itemId: string }>()
  const { data: item, isPending, isError } = useItem(itemId)
  const [enrichOpen, setEnrichOpen] = useState(false)

  const playItem = usePlayerStore((s) => s.play)
  const activeSessionItemId = usePlayerStore((s) => s.session?.libraryItemId)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row">
          <Skeleton className="aspect-[2/3] w-full max-w-56 rounded-xl" />
          <div className="flex-1 space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (isError || !item) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 py-24 text-center">
        <p className="font-medium">Couldn't load this book</p>
        <p className="mt-1 text-sm text-muted-foreground">It may have been removed from the library.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/">Back to library</Link>
        </Button>
      </div>
    )
  }

  const media = item.media as BookMediaMinified
  const meta = media.metadata
  const progress = item.userMediaProgress
  const title = meta.title ?? 'Untitled'

  // The expanded endpoint returns series as an array of refs; minified listings
  // return a single object or nothing at all.
  const seriesRefs: BookSeriesRef[] = Array.isArray(meta.series) ? meta.series : meta.series ? [meta.series] : []

  const isThisPlaying = activeSessionItemId === item.id && isPlaying
  const hasProgress = Boolean(progress && progress.progress > 0 && !progress.isFinished)

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5 gap-1.5 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Library
        </Link>
      </Button>

      <div className="flex flex-col gap-8 sm:flex-row sm:gap-10">
        <div className="w-full max-w-56 shrink-0 self-center sm:self-start">
          <div className="relative aspect-[2/3] overflow-hidden rounded-xl border bg-muted shadow-lg">
            <img src={coverUrl(item.id, { width: 500, ts: item.updatedAt })} alt="" className="size-full object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
          </div>

          {progress && progress.progress > 0 && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-playing" style={{ width: `${Math.min(progress.progress * 100, 100)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{progress.isFinished ? 'Finished' : `${Math.round(progress.progress * 100)}% · ${formatDuration(progress.duration - progress.currentTime)} left`}</p>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {meta.subtitle && <p className="mt-1 text-base text-muted-foreground">{meta.subtitle}</p>}
          {meta.authorName && <p className="mt-2 text-sm font-medium text-primary">{meta.authorName}</p>}

          {seriesRefs.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {seriesRefs.map((series) => (
                <Link key={series.id} to={`/series/${series.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                  <Layers className="size-3.5" />
                  {series.name}
                  {series.sequence && <span className="tabular-nums">#{series.sequence}</span>}
                </Link>
              ))}
            </div>
          )}

          {meta.genres.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {meta.genres.map((genre) => (
                <Link key={genre} to={`/library?filter=${encodeURIComponent(encodeFilter('genres', genre))}`}>
                  <Pill className="transition-colors hover:bg-accent">{genre}</Pill>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-4 border-y py-5 sm:grid-cols-3">
            {meta.narratorName && <Fact icon={Mic} label="Narrator" value={meta.narratorName} />}
            <Fact icon={Clock} label="Duration" value={formatDuration(media.duration)} />
            <Fact icon={ListTree} label="Chapters" value={String(media.numChapters)} />
            {meta.publishedYear && <Fact icon={CalendarDays} label="Published" value={meta.publishedYear} />}
            {meta.publisher && <Fact icon={BookOpen} label="Publisher" value={meta.publisher} />}
            <Fact icon={BookOpen} label="Size" value={formatBytes(media.size)} />
          </div>

          {meta.description && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-medium">Description</h2>
              {/* The server stores descriptions as HTML; render as text so a
                  malicious or malformed scrape cannot inject markup here. */}
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{meta.description}</p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button onClick={() => void playItem(item)} className="gap-1.5">
              {isThisPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
              {isThisPlaying ? 'Pause' : hasProgress ? 'Resume' : 'Play'}
            </Button>
            <Button variant="outline" onClick={() => setEnrichOpen(true)} className="gap-1.5">
              <Sparkles className="size-4" />
              Enrich metadata
            </Button>
          </div>
        </div>
      </div>

      <EnrichDialog open={enrichOpen} onOpenChange={setEnrichOpen} itemId={item.id} metadata={meta} />
    </div>
  )
}

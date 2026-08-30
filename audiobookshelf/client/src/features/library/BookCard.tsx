import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'

import { cn } from '@/lib/utils'
import { coverUrl } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { Button } from '@/components/ui/button'
import type { BookMediaMinified, LibraryItemMinified, PodcastMediaMinified } from '@/types/abs'

interface ItemDisplay {
  title: string
  subtitle: string | null
  duration: number | null
  progress: number
  isFinished: boolean
}

/**
 * Book and podcast media serialise differently (`authorName` vs `author`, and
 * podcasts carry no aggregate duration), so normalise once here rather than
 * branching throughout the card.
 */
export function toDisplay(item: LibraryItemMinified, progressPct = 0, isFinished = false): ItemDisplay {
  if (item.mediaType === 'podcast') {
    const media = item.media as PodcastMediaMinified
    const episodes = media.numEpisodes
    return {
      title: media.metadata.title ?? 'Untitled',
      subtitle: media.metadata.author ?? (episodes ? `${episodes} episodes` : null),
      duration: null,
      progress: progressPct,
      isFinished
    }
  }
  const media = item.media as BookMediaMinified
  return {
    title: media.metadata.title ?? 'Untitled',
    subtitle: media.metadata.authorName || null,
    duration: media.duration,
    progress: progressPct,
    isFinished
  }
}

interface BookCardProps {
  item: LibraryItemMinified
  progress?: number
  isFinished?: boolean
  onPlay?: (item: LibraryItemMinified) => void
  /** Series position, shown as a corner badge in series-ordered views. */
  sequence?: string | null
}

export function BookCard({ item, progress = 0, isFinished = false, onPlay, sequence }: BookCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const display = toDisplay(item, progress, isFinished)

  return (
    <article className="group relative flex flex-col gap-2.5">
      {/* The cover is the click target for the whole card; the title below links
          to the same place so the hit area is generous without nesting links. */}
      <Link to={`/item/${item.id}`} aria-label={display.title} className="absolute inset-0 z-10 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" />

      <div className="relative aspect-[2/3] overflow-hidden rounded-xl border bg-muted shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-black/20">
        {imageFailed ? (
          // Scanned libraries routinely have items with no artwork; a typographic
          // fallback keeps the grid rhythm instead of leaving a hole.
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-muted to-accent p-3">
            <span className="line-clamp-4 text-center text-xs font-medium text-muted-foreground">{display.title}</span>
          </div>
        ) : (
          <img src={coverUrl(item.id, { width: 400, ts: item.updatedAt })} alt="" loading="lazy" decoding="async" onError={() => setImageFailed(true)} className="size-full object-cover" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {onPlay && (
          <Button
            size="icon"
            aria-label={`Play ${display.title}`}
            onClick={() => onPlay(item)}
            className="absolute bottom-2.5 right-2.5 z-20 size-10 translate-y-2 rounded-full opacity-0 shadow-lg transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"
          >
            <Play className="size-4 fill-current" />
          </Button>
        )}

        {display.progress > 0 && !display.isFinished && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
            <div className="h-full bg-playing transition-[width]" style={{ width: `${Math.min(display.progress * 100, 100)}%` }} />
          </div>
        )}

        {display.isFinished && <div className="absolute left-2.5 top-2.5 rounded-md bg-playing px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-playing-foreground">Finished</div>}

        {sequence && !display.isFinished && (
          <div className="absolute left-2.5 top-2.5 flex size-6 items-center justify-center rounded-md bg-background/85 text-[11px] font-semibold tabular-nums backdrop-blur-sm" title={`Book ${sequence} in series`}>
            {sequence}
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-0.5">
        <h3 className={cn('truncate text-sm font-medium leading-snug', 'group-hover:text-primary transition-colors')} title={display.title}>
          {display.title}
        </h3>
        {display.subtitle && (
          <p className="truncate text-xs text-muted-foreground" title={display.subtitle}>
            {display.subtitle}
          </p>
        )}
        {display.duration !== null && <p className="text-xs tabular-nums text-muted-foreground/70">{formatDuration(display.duration)}</p>}
      </div>
    </article>
  )
}

export function BookCardSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="aspect-[2/3] animate-pulse rounded-xl bg-muted" />
      <div className="space-y-1.5">
        <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}

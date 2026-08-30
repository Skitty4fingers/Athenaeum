import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Layers } from 'lucide-react'

import { coverUrl } from '@/lib/api'
import type { LibraryItemMinified } from '@/types/abs'

/**
 * Stands in for a whole series when the grid is collapsed. The server picks a
 * representative item (the lowest sequence) and attaches `collapsedSeries`, so
 * the cover shown is book one's.
 */
export function SeriesCard({ item }: { item: LibraryItemMinified }) {
  const [imageFailed, setImageFailed] = useState(false)
  const series = item.collapsedSeries
  if (!series) return null

  return (
    <article className="group relative flex flex-col gap-2.5">
      <Link to={`/series/${series.id}`} aria-label={series.name} className="absolute inset-0 z-10 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" />

      {/* Stacked edges hint that this card stands for several books. */}
      <div className="relative aspect-[2/3]">
        <div aria-hidden className="absolute inset-y-2 -right-1.5 left-3 rounded-xl border bg-card/70" />
        <div aria-hidden className="absolute inset-y-1 -right-0.5 left-1.5 rounded-xl border bg-card/85" />

        <div className="relative size-full overflow-hidden rounded-xl border bg-muted shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-black/20">
          {imageFailed ? (
            <div className="flex size-full items-center justify-center bg-gradient-to-br from-muted to-accent p-3">
              <span className="line-clamp-4 text-center text-xs font-medium text-muted-foreground">{series.name}</span>
            </div>
          ) : (
            <img src={coverUrl(item.id, { width: 400, ts: item.updatedAt })} alt="" loading="lazy" decoding="async" onError={() => setImageFailed(true)} className="size-full object-cover" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

          <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm">
            <Layers className="size-3" />
            {series.numBooks}
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-0.5">
        <h3 className="truncate text-sm font-medium leading-snug transition-colors group-hover:text-primary" title={series.name}>
          {series.name}
        </h3>
        <p className="truncate text-xs text-muted-foreground">
          {series.numBooks} book{series.numBooks === 1 ? '' : 's'}
        </p>
      </div>
    </article>
  )
}

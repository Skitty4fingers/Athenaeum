import { Play, X } from 'lucide-react'

import { coverUrl } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { usePlayerStore } from '@/stores/player'
import type { BookMediaMinified } from '@/types/abs'

/**
 * A book finished and it's part of a series with a next entry — offer it,
 * don't auto-continue. Renders as a thin strip inside PlayerBar's own fixed
 * container (not a separate fixed element), so it always sits directly above
 * the transport row without needing to coordinate stacking offsets.
 */
export function UpNextStrip() {
  const upNext = usePlayerStore((s) => s.upNext)
  const play = usePlayerStore((s) => s.play)
  const dismissUpNext = usePlayerStore((s) => s.dismissUpNext)

  if (!upNext) return null
  const media = upNext.media as BookMediaMinified

  return (
    <div className="flex items-center gap-3 border-b px-3 py-2 sm:px-4">
      <img src={coverUrl(upNext.id, { width: 64, ts: upNext.updatedAt })} alt="" className="size-8 shrink-0 rounded object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">Up next</p>
        <p className="truncate text-sm font-medium leading-tight">{media.metadata.title}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={() => void play(upNext)} className="shrink-0 gap-1.5">
        <Play className="size-3.5 fill-current" />
        Play
      </Button>
      <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" onClick={dismissUpNext} aria-label="Dismiss">
        <X className="size-3.5" />
      </Button>
    </div>
  )
}

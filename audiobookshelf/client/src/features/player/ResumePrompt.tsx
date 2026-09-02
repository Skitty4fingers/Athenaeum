import { useEffect } from 'react'
import { Play, X } from 'lucide-react'

import { coverUrl } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/kibo-ui/spinner'
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import { useResumeItem } from '@/hooks/use-resume-item'
import type { BookMediaMinified } from '@/types/abs'

/**
 * The playback session lives only in memory, so a reload always drops it —
 * see the module doc on `stores/player.ts`. Rather than silently starting
 * audio on page load (which browsers block anyway without a user gesture,
 * and which would be surprising even if they didn't), this offers a single
 * tap to pick the last book back up.
 *
 * Starting real playback needs a server round trip no matter what — a track
 * URL only exists once `/play` mints a session, and that session creation
 * has real side effects (closes this device's other sessions, appears in
 * admin activity), so it can't fire silently on page load just to pre-load
 * audio. What this *can* do without any of that: show exactly where the
 * user will land — the saved position and time remaining, from
 * `user.mediaProgress`, already in memory from login — so tapping "Resume"
 * feels like continuing, not restarting from a blank state, even though the
 * network round trip still happens on tap.
 *
 * Mutually exclusive with `PlayerBar`: this only ever shows when nothing is
 * currently loaded.
 */
export function ResumePrompt() {
  const session = usePlayerStore((s) => s.session)
  const resumeItemId = usePlayerStore((s) => s.resumeItemId)
  const dismissResume = usePlayerStore((s) => s.dismissResume)
  const play = usePlayerStore((s) => s.play)
  const isLoading = usePlayerStore((s) => s.isLoading)
  const mediaProgress = useAuthStore((s) => s.user?.mediaProgress)

  const { data: item, isPending, isError } = useResumeItem(session ? null : resumeItemId)

  useEffect(() => {
    if (isError) dismissResume()
  }, [isError, dismissResume])

  if (!resumeItemId || session || isPending || isError || !item) return null

  const media = item.media as BookMediaMinified
  const progress = mediaProgress?.find((mp) => mp.libraryItemId === item.id && !mp.episodeId)
  const remaining = progress && progress.duration > progress.currentTime ? progress.duration - progress.currentTime : null
  const percent = progress && progress.duration > 0 ? Math.min(100, (progress.currentTime / progress.duration) * 100) : null

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur-md">
      {percent !== null && (
        <div className="h-0.5 w-full bg-muted">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      )}
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
        <img src={coverUrl(item.id, { width: 96, ts: item.updatedAt })} alt="" className="size-11 shrink-0 rounded-md object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">Continue listening?</p>
          <p className="truncate text-xs text-muted-foreground">
            {media.metadata.title} — {media.metadata.authorName}
            {remaining !== null && ` · ${formatDuration(remaining)} left`}
          </p>
        </div>
        <Button size="sm" onClick={() => void play(item)} disabled={isLoading} className="shrink-0 gap-1.5">
          {isLoading ? <Spinner variant="ring" size={14} /> : <Play className="size-3.5 fill-current" />}
          Resume
        </Button>
        <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" onClick={dismissResume} aria-label="Dismiss">
          <X className="size-4" />
        </Button>
      </div>
    </div>
  )
}

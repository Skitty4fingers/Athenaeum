import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gauge, ListTree, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { coverUrl } from '@/lib/api'
import { formatClock } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/kibo-ui/spinner'
import { chapterAt, usePlayerStore } from '@/stores/player'
import { BookmarksMenu } from './BookmarksMenu'
import { SleepTimerMenu } from './SleepTimerMenu'
import { UpNextStrip } from './UpNextStrip'

const SPEEDS = [0.75, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]

export function PlayerBar() {
  const session = usePlayerStore((s) => s.session)
  const item = usePlayerStore((s) => s.item)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isLoading = usePlayerStore((s) => s.isLoading)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const playbackRate = usePlayerStore((s) => s.playbackRate)
  const volume = usePlayerStore((s) => s.volume)
  const jumpBackwardAmount = usePlayerStore((s) => s.jumpBackwardAmount)
  const jumpForwardAmount = usePlayerStore((s) => s.jumpForwardAmount)
  const error = usePlayerStore((s) => s.error)

  const toggle = usePlayerStore((s) => s.toggle)
  const seek = usePlayerStore((s) => s.seek)
  const skip = usePlayerStore((s) => s.skip)
  const setRate = usePlayerStore((s) => s.setRate)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const jumpToChapter = usePlayerStore((s) => s.jumpToChapter)
  const nextChapter = usePlayerStore((s) => s.nextChapter)
  const previousChapter = usePlayerStore((s) => s.previousChapter)
  const close = usePlayerStore((s) => s.close)

  /** While dragging, the slider follows the pointer rather than playback. */
  const [scrubTime, setScrubTime] = useState<number | null>(null)

  // Space toggles playback, arrows skip — unless the user is typing.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!session) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return

      if (event.code === 'Space') {
        event.preventDefault()
        toggle()
      } else if (event.code === 'ArrowRight' && !event.shiftKey) {
        skip(jumpForwardAmount)
      } else if (event.code === 'ArrowLeft' && !event.shiftKey) {
        skip(-jumpBackwardAmount)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [session, toggle, skip, jumpForwardAmount, jumpBackwardAmount])

  if (!session || !item) return null

  const displayTime = scrubTime ?? currentTime
  const chapter = chapterAt(session.chapters, displayTime)
  const remaining = Math.max(duration - displayTime, 0)

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur-md">
      {error && <p className="bg-destructive/10 px-4 py-1.5 text-center text-xs text-destructive">{error}</p>}

      <UpNextStrip />

      {/* Scrubber sits flush against the top edge so it reads as a progress line. */}
      <div className="px-3 pt-2">
        <Slider
          value={[displayTime]}
          max={Math.max(duration, 1)}
          step={1}
          aria-label="Seek"
          onValueChange={([value]) => setScrubTime(value)}
          onValueCommit={([value]) => {
            seek(value)
            setScrubTime(null)
          }}
        />
      </div>

      <div className="flex items-center gap-3 px-3 pb-2.5 pt-1.5 sm:gap-4 sm:px-4">
        {/* Cover + title open the full Now Playing screen; the transport
            buttons to the right keep their own click handlers regardless. */}
        <Link to="/now-playing" className="flex min-w-0 flex-1 items-center gap-3 sm:w-64 sm:flex-none">
          <img src={coverUrl(item.id, { width: 96, ts: item.updatedAt })} alt="" className="size-11 shrink-0 rounded-md object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{session.displayTitle}</p>
            <p className="truncate text-xs text-muted-foreground">{chapter?.title ?? session.displayAuthor}</p>
          </div>
        </Link>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <Button variant="ghost" size="icon" onClick={previousChapter} aria-label="Previous chapter" className="hidden sm:inline-flex">
            <SkipBack className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => skip(-jumpBackwardAmount)} aria-label={`Back ${jumpBackwardAmount} seconds`}>
            <RotateCcw className="size-4" />
          </Button>

          <Button size="icon" onClick={toggle} aria-label={isPlaying ? 'Pause' : 'Play'} className="size-10 rounded-full">
            {isLoading ? <Spinner variant="ring" size={16} /> : isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </Button>

          <Button variant="ghost" size="icon" onClick={() => skip(jumpForwardAmount)} aria-label={`Forward ${jumpForwardAmount} seconds`}>
            <RotateCw className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={nextChapter} aria-label="Next chapter" className="hidden sm:inline-flex">
            <SkipForward className="size-4" />
          </Button>
        </div>

        <div className="hidden shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground sm:flex">
          <span>{formatClock(displayTime)}</span>
          <span aria-hidden>/</span>
          <span title="Remaining">-{formatClock(remaining)}</span>
        </div>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {session.chapters.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Chapters">
                  <ListTree className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <p className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{session.chapters.length} chapters</p>
                <ScrollArea className="max-h-80 scrollbar-slim">
                  <div className="p-1">
                    {session.chapters.map((c) => {
                      const active = chapter?.id === c.id
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => jumpToChapter(c)}
                          className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors', active ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-accent/60')}
                        >
                          <span className="min-w-0 flex-1 truncate">{c.title}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatClock(c.start)}</span>
                        </button>
                      )
                    })}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Playback speed" className="relative">
                <Gauge className="size-4" />
                {playbackRate !== 1 && <span className="absolute -bottom-0.5 right-0.5 rounded bg-primary px-0.5 text-[9px] font-semibold leading-tight text-primary-foreground">{playbackRate}×</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-32 p-1">
              {SPEEDS.map((speed) => (
                <button key={speed} type="button" onClick={() => setRate(speed)} className={cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors', speed === playbackRate ? 'bg-accent font-medium' : 'hover:bg-accent/60')}>
                  {speed}×
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <BookmarksMenu buttonClassName="hidden sm:inline-flex" />
          <SleepTimerMenu buttonClassName="hidden sm:inline-flex" />

          <div className="hidden items-center gap-1.5 lg:flex">
            <Button variant="ghost" size="icon" onClick={() => setVolume(volume > 0 ? 0 : 1)} aria-label={volume > 0 ? 'Mute' : 'Unmute'}>
              {volume > 0 ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </Button>
            <Slider value={[volume]} max={1} step={0.05} onValueChange={([v]) => setVolume(v)} aria-label="Volume" className="w-20" />
          </div>

          <Button variant="ghost" size="icon" onClick={() => void close()} aria-label="Close player" className="text-muted-foreground">
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

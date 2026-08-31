import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ChevronDown, Gauge, ListTree, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from 'lucide-react'

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

/**
 * Full-screen playback view — cover, chapter, scrubber, transport, opened by
 * tapping the mini player bar. Reads the same player store as PlayerBar, so
 * nothing here owns playback state; this is purely a bigger window onto it.
 */
export function NowPlayingPage() {
  const session = usePlayerStore((s) => s.session)
  const item = usePlayerStore((s) => s.item)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isLoading = usePlayerStore((s) => s.isLoading)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const playbackRate = usePlayerStore((s) => s.playbackRate)
  const jumpBackwardAmount = usePlayerStore((s) => s.jumpBackwardAmount)
  const jumpForwardAmount = usePlayerStore((s) => s.jumpForwardAmount)

  const toggle = usePlayerStore((s) => s.toggle)
  const seek = usePlayerStore((s) => s.seek)
  const skip = usePlayerStore((s) => s.skip)
  const setRate = usePlayerStore((s) => s.setRate)
  const jumpToChapter = usePlayerStore((s) => s.jumpToChapter)
  const nextChapter = usePlayerStore((s) => s.nextChapter)
  const previousChapter = usePlayerStore((s) => s.previousChapter)

  const [scrubTime, setScrubTime] = useState<number | null>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (event.code === 'Space') {
        event.preventDefault()
        toggle()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  // Nothing playing and nothing to show — send back to the library rather
  // than rendering an empty player shell.
  if (!session || !item) return <Navigate to="/" replace />

  const displayTime = scrubTime ?? currentTime
  const chapter = chapterAt(session.chapters, displayTime)
  const remaining = Math.max(duration - displayTime, 0)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-3">
        <Button asChild variant="ghost" size="icon" aria-label="Close now playing">
          <Link to="/">
            <ChevronDown className="size-5" />
          </Link>
        </Button>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Now Playing</p>
        <div className="flex items-center">
          <BookmarksMenu iconClassName="size-5" />
          <SleepTimerMenu iconClassName="size-5" />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Playback speed" className="relative">
                <Gauge className="size-5" />
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
        </div>
      </header>

      <UpNextStrip />

      <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 pb-6">
        <Link to={`/item/${item.id}`} className="w-full max-w-xs">
          <div className="aspect-square w-full overflow-hidden rounded-2xl border bg-muted shadow-2xl shadow-black/30">
            <img src={coverUrl(item.id, { width: 800, ts: item.updatedAt })} alt="" className="size-full object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
          </div>
        </Link>

        <div className="w-full max-w-sm text-center">
          <Link to={`/item/${item.id}`} className="text-xl font-semibold tracking-tight hover:text-primary">
            {session.displayTitle}
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">{chapter?.title ?? session.displayAuthor}</p>
        </div>

        <div className="w-full max-w-sm space-y-1.5">
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
          <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
            <span>{formatClock(displayTime)}</span>
            <span>-{formatClock(remaining)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={previousChapter} aria-label="Previous chapter" className="size-11">
            <SkipBack className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => skip(-jumpBackwardAmount)} aria-label={`Back ${jumpBackwardAmount} seconds`} className="size-11">
            <RotateCcw className="size-5" />
          </Button>
          <Button size="icon" onClick={toggle} aria-label={isPlaying ? 'Pause' : 'Play'} className="size-16 rounded-full">
            {isLoading ? <Spinner variant="ring" size={22} /> : isPlaying ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => skip(jumpForwardAmount)} aria-label={`Forward ${jumpForwardAmount} seconds`} className="size-11">
            <RotateCw className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={nextChapter} aria-label="Next chapter" className="size-11">
            <SkipForward className="size-5" />
          </Button>
        </div>

        {session.chapters.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <ListTree className="size-4" />
                Chapters
              </Button>
            </PopoverTrigger>
            <PopoverContent align="center" className="w-80 p-0">
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
      </div>
    </div>
  )
}

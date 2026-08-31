import { Moon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatClock } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { usePlayerStore } from '@/stores/player'

const DURATIONS_MIN = [5, 15, 30, 45, 60]

export function SleepTimerMenu({ iconClassName = 'size-4', buttonClassName }: { iconClassName?: string; buttonClassName?: string }) {
  const sleepTimerMode = usePlayerStore((s) => s.sleepTimerMode)
  const sleepTimerSecondsRemaining = usePlayerStore((s) => s.sleepTimerSecondsRemaining)
  const setSleepTimerDuration = usePlayerStore((s) => s.setSleepTimerDuration)
  const setSleepTimerEndOfChapter = usePlayerStore((s) => s.setSleepTimerEndOfChapter)
  const cancelSleepTimer = usePlayerStore((s) => s.cancelSleepTimer)

  const active = sleepTimerMode !== null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Sleep timer" className={cn('relative', buttonClassName)}>
          <Moon className={cn(iconClassName, active && 'fill-current')} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        {active ? (
          <>
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{sleepTimerMode === 'chapter' ? 'Stopping at end of chapter' : `Stopping in ${formatClock(sleepTimerSecondsRemaining)}`}</p>
            <button type="button" onClick={cancelSleepTimer} className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-accent/60">
              Cancel timer
            </button>
          </>
        ) : (
          <>
            {DURATIONS_MIN.map((minutes) => (
              <button key={minutes} type="button" onClick={() => setSleepTimerDuration(minutes)} className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/60">
                {minutes} min
              </button>
            ))}
            <button type="button" onClick={setSleepTimerEndOfChapter} className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/60">
              End of chapter
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

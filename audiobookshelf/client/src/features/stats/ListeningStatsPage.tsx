import { Link } from 'react-router-dom'
import { ArrowLeft, BarChart3, Headphones } from 'lucide-react'

import { useListeningStats } from '@/hooks/use-listening-stats'
import { coverUrl } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** How many days of the `days` history to chart — recent enough to be useful, short enough to stay legible as a bar row. */
const RECENT_DAYS = 14

function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function BarRow({ label, seconds, maxSeconds }: { label: string; seconds: number; maxSeconds: number }) {
  const pct = maxSeconds > 0 ? Math.max((seconds / maxSeconds) * 100, seconds > 0 ? 3 : 0) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{seconds > 0 ? formatDuration(seconds) : '--'}</span>
    </div>
  )
}

export function ListeningStatsPage() {
  const { data: stats, isPending, isError } = useListeningStats()

  const topItems = Object.values(stats?.items ?? {})
    .sort((a, b) => b.timeListening - a.timeListening)
    .slice(0, 10)

  const maxDayOfWeek = Math.max(1, ...DAYS_OF_WEEK.map((d) => stats?.dayOfWeek[d] ?? 0))

  const recentDays: { date: string; seconds: number }[] = []
  if (stats) {
    for (let i = RECENT_DAYS - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const iso = d.toISOString().slice(0, 10)
      recentDays.push({ date: iso, seconds: stats.days[iso] ?? 0 })
    }
  }
  const maxRecentDay = Math.max(1, ...recentDays.map((d) => d.seconds))

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5 gap-1.5 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Library
        </Link>
      </Button>

      <div className="mb-6 flex items-center gap-2.5">
        <BarChart3 className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Listening stats</h1>
      </div>

      {isPending && (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {isError && <p className="text-sm text-muted-foreground">Couldn't load your listening stats.</p>}

      {stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total listened</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatDuration(stats.totalTime)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Today</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatDuration(stats.today)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Books</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{Object.keys(stats.items).length}</p>
            </div>
          </div>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-medium">Last {RECENT_DAYS} days</h2>
            <div className="mt-4 space-y-1.5">
              {recentDays.map((d) => (
                <BarRow key={d.date} label={formatDayLabel(d.date)} seconds={d.seconds} maxSeconds={maxRecentDay} />
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-medium">By day of week</h2>
            <div className="mt-4 space-y-1.5">
              {DAYS_OF_WEEK.map((day) => (
                <BarRow key={day} label={day.slice(0, 3)} seconds={stats.dayOfWeek[day] ?? 0} maxSeconds={maxDayOfWeek} />
              ))}
            </div>
          </section>

          {topItems.length > 0 && (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-medium">Most listened</h2>
              <ul className="mt-4 space-y-2">
                {topItems.map((item) => (
                  <li key={item.id}>
                    <Link to={`/item/${item.id}`} className="flex items-center gap-3 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent/60">
                      <img src={coverUrl(item.id, { width: 80 })} alt="" className="size-10 shrink-0 rounded object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.mediaMetadata?.title ?? 'Untitled'}</p>
                        {item.mediaMetadata?.authorName && <p className="truncate text-xs text-muted-foreground">{item.mediaMetadata.authorName}</p>}
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDuration(item.timeListening)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stats.recentSessions.length > 0 && (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-medium">Recent sessions</h2>
              <ul className="mt-4 space-y-2">
                {stats.recentSessions.map((session) => (
                  <li key={session.id}>
                    <Link to={`/item/${session.libraryItemId}`} className="flex items-center gap-3 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent/60">
                      <Headphones className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{session.displayTitle}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {session.dayOfWeek}, {session.date}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDuration(session.timeListening)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

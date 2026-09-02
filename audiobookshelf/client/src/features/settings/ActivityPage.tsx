import { Link } from 'react-router-dom'
import { Activity, ArrowLeft, Clock, Headphones, Monitor, Users as UsersIcon } from 'lucide-react'

import { useAuthStore } from '@/stores/auth'
import { useUsers } from '@/hooks/use-users'
import { useOnlineUsers, useRecentSessions } from '@/hooks/use-telemetry'
import { coverUrl } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { OnlineUser, OpenPlaybackSession, SessionWithUser, User } from '@/types/abs'

/**
 * How much history to show. The live panels above are the point of this page;
 * a long tail of past sessions pushes them off screen.
 */
const RECENT_LIMIT = 12

/** "3 minutes ago" style, falling back to an absolute date once it stops being useful. */
function formatRelative(ms: number | null | undefined): string {
  if (!ms) return 'Never'
  const diff = Date.now() - ms
  if (diff < 0) return 'Just now'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function formatExact(ms: number | null | undefined): string {
  return ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

/** Client name plus version, e.g. "Athenaeum 2.36.0" — falls back to the media player id. */
function describeDevice(session: OpenPlaybackSession | SessionWithUser): string {
  const info = session.deviceInfo
  const name = info?.clientName || session.mediaPlayer || 'Unknown client'
  return info?.clientVersion ? `${name} ${info.clientVersion}` : name
}

/**
 * Stat tile. The value uses the font's proportional figures deliberately —
 * `tabular-nums` gives every digit the width of a zero, which reads loose at
 * display sizes. Tabular figures belong in the table columns below, where
 * numbers have to line up vertically.
 */
function StatTile({ icon: Icon, label, value, hint }: { icon: typeof UsersIcon; label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold leading-tight">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** A live stream: who, what, how far in, on what. */
function ListeningRow({ session, username }: { session: OpenPlaybackSession; username: string }) {
  const pct = session.duration > 0 ? Math.min(100, Math.max(0, (session.currentTime / session.duration) * 100)) : 0

  return (
    <li className="relative flex items-center gap-3 px-4 py-3">
      {/* The muted tile sits behind the cover, so a book with no artwork reads
          as an empty slot rather than a broken image. */}
      <div className="flex size-11 shrink-0 items-center justify-center rounded bg-muted">
        <Headphones className="size-4 text-muted-foreground" aria-hidden />
        <img src={coverUrl(session.libraryItemId, { width: 80 })} alt="" className="absolute size-11 rounded object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          <Link to={`/item/${session.libraryItemId}`} className="hover:underline">
            {session.displayTitle ?? 'Unknown title'}
          </Link>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {username} · {session.displayAuthor ?? 'Unknown author'}
        </p>
        {/* bg-playing is this app's "being listened to" accent — see the README's
            design tokens — so a live stream never reads as a primary action. */}
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-playing" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <p className="tabular-nums">
          {formatDuration(session.currentTime)} / {formatDuration(session.duration)}
        </p>
        <p className="truncate">{describeDevice(session)}</p>
        <p className="tabular-nums">{formatDuration(session.timeListening)} this session</p>
      </div>
    </li>
  )
}

function UserRow({ user, online }: { user: User; online: OnlineUser | undefined }) {
  return (
    <tr className="border-t">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`size-2 shrink-0 rounded-full ${online ? 'bg-playing' : 'bg-muted-foreground/30'}`} aria-hidden />
          <span className="font-medium">{user.username}</span>
          <span className="text-xs text-muted-foreground">{user.type}</span>
          {!user.isActive && <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">disabled</span>}
        </div>
      </td>
      {/* The status column repeats the dot in words: colour alone never carries meaning. */}
      <td className="px-4 py-2.5 text-muted-foreground">{online ? 'Online' : 'Offline'}</td>
      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{online ? online.connections : '—'}</td>
      <td className="px-4 py-2.5 text-muted-foreground" title={formatExact(user.lastSeen)}>
        {online ? 'Now' : formatRelative(user.lastSeen)}
      </td>
      <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell" title={formatExact(user.createdAt)}>
        {formatRelative(user.createdAt)}
      </td>
    </tr>
  )
}

/**
 * Admin activity — who is connected, what they are listening to, and what has
 * been played recently.
 *
 * Every figure comes from data audiobookshelf already keeps: socket connection
 * counts, in-memory playback sessions, `lastSeen`, and the session history
 * table. Nothing new is recorded, and no endpoint was added — see
 * `hooks/use-telemetry.ts`.
 */
export function ActivityPage() {
  const isAdmin = useAuthStore((s) => s.user?.type === 'root' || s.user?.type === 'admin')

  const { data: online, isPending: onlinePending } = useOnlineUsers(isAdmin)
  const { data: users } = useUsers(isAdmin)
  const { data: recent, isPending: recentPending } = useRecentSessions(RECENT_LIMIT, isAdmin)

  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <p className="text-sm text-muted-foreground">Activity is only visible to admins.</p>
      </div>
    )
  }

  const usersOnline = online?.usersOnline ?? []
  const openSessions = online?.openSessions ?? []
  const usernameById = new Map<string, string>((users ?? []).map((u) => [u.id, u.username]))
  const onlineById = new Map(usersOnline.map((u) => [u.id, u]))
  const totalConnections = usersOnline.reduce((sum, u) => sum + (u.connections || 0), 0)

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5 gap-1.5 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Library
        </Link>
      </Button>

      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="size-4" />
          Admin
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">Who is connected right now, what they are listening to, and what has been played recently. Updates live.</p>
      </div>

      {onlinePending ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatTile icon={UsersIcon} label="Users online" value={usersOnline.length} hint={`of ${users?.length ?? 0} total`} />
          <StatTile icon={Monitor} label="Open connections" value={totalConnections} hint="browser tabs and apps" />
          <StatTile icon={Headphones} label="Listening now" value={openSessions.length} hint={openSessions.length === 1 ? 'active stream' : 'active streams'} />
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium">Listening now</h2>
        <div className="rounded-lg border bg-card">
          {onlinePending ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
            </div>
          ) : openSessions.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nobody is listening right now.</p>
          ) : (
            <ul className="divide-y">
              {openSessions.map((session) => (
                <ListeningRow key={session.id} session={session} username={usernameById.get(session.userId) ?? 'Unknown user'} />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium">Users</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Connections</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((user) => (
                <UserRow key={user.id} user={user} online={onlineById.get(user.id)} />
              ))}
            </tbody>
          </table>
          {!users?.length && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No users yet.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <Clock className="size-3.5 text-muted-foreground" />
          Recent sessions
        </h2>
        <div className="rounded-lg border bg-card">
          {recentPending ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : !recent?.sessions.length ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing has been played yet.</p>
          ) : (
            <ul className="divide-y">
              {recent.sessions.map((session) => (
                <li key={session.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <Link to={`/item/${session.libraryItemId}`} className="hover:underline">
                        {session.displayTitle ?? 'Unknown title'}
                      </Link>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {session.user?.username ?? usernameById.get(session.userId) ?? 'Unknown user'} · {describeDevice(session)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <p className="tabular-nums">{formatDuration(session.timeListening)}</p>
                    <p title={formatExact(session.updatedAt)}>{formatRelative(session.updatedAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

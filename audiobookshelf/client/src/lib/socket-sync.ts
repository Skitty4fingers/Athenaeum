import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getSocket } from './socket'
import { useAuthStore } from '@/stores/auth'
import { usePlayerStore } from '@/stores/player'
import type { MediaProgress } from '@/types/abs'

/**
 * Live sync: server socket events -> React Query invalidations.
 *
 * The server is the source of truth, so this layer never patches cached
 * *entities* from event payloads — it only marks the queries they affect as
 * stale and lets React Query refetch whatever is actually mounted. That keeps
 * the mapping declarative (see `keysForEvent`, a pure function) and means a
 * payload shape changing upstream can't corrupt the cache, only refetch it.
 *
 * Two stores are the exception, because they are plain Zustand state that no
 * invalidation can reach: `user.mediaProgress` (what the sidebar counts,
 * Continue Listening and every grid progress bar read) and the user record
 * itself. Those are patched directly from the payload.
 *
 * Scope is docs/GAP-CLOSURE-PLAN.md lane B, Tiers 1 and 2: items, libraries,
 * the current user's progress/account, collections, playlists, authors, series
 * and playback sessions — plus the admin presence events behind the activity
 * page (`user_online`, `user_offline`, `user_stream_update`), which the server
 * sends only to admin clients, so those handlers are inert for everyone else.
 *
 * Deliberately not subscribed: podcast (`episode_*`), RSS (`rss_feed_*`),
 * metadata-embed and backup events, because those features are out of scope
 * for this client (docs/PLAN.md); and `stream_reset`, which only concerns HLS
 * transcoding — this client plays audio files directly and never opens an HLS
 * stream, so a handler for it would be unreachable code.
 */

export type QueryKey = readonly unknown[]

/**
 * A burst of events (a scan finishing, a bulk edit over 200 books) is one
 * refetch, not 200. The window runs from the *first* pending event rather than
 * resetting on each one — a resetting debounce would starve during a long
 * stream of events and never flush until it stopped.
 */
export const COALESCE_MS = 300

/** Events this layer subscribes to. Anything not listed is ignored. */
export const SYNCED_EVENTS = [
  'item_added',
  'item_updated',
  'item_removed',
  'items_added',
  'items_updated',
  'library_added',
  'library_updated',
  'library_removed',
  'task_finished',
  'user_item_progress_updated',
  'user_updated',
  // Tier 2 — shared surfaces.
  'collection_added',
  'collection_updated',
  'collection_removed',
  'playlist_added',
  'playlist_updated',
  'playlist_removed',
  'author_added',
  'author_updated',
  'author_removed',
  'authors_num_books_updated',
  'series_added',
  'series_updated',
  'series_removed',
  'user_session_closed',
  // Admin presence/telemetry. SocketAuthority sends these with `adminEmitter`,
  // so a non-admin client simply never receives them and the handler is inert.
  'user_online',
  'user_offline',
  'user_stream_update'
] as const

interface ItemLike {
  id?: unknown
  libraryId?: unknown
}

/** Progress payload — see server/controllers/SessionController.js. */
interface ProgressPayload {
  sessionId?: unknown
  data?: Partial<MediaProgress>
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

/**
 * Everything derived from a library's *contents*. Scoped to one library when
 * the payload identifies it, otherwise invalidated as a prefix across all of
 * them — a missing id should over-refetch, never silently skip.
 */
function libraryContentKeys(libraryIds: Set<string>): QueryKey[] {
  if (!libraryIds.size) {
    return [['library-series'], ['library-filterdata'], ['library-stats']]
  }
  return [...libraryIds].flatMap((id) => [
    ['library-series', id],
    ['library-filterdata', id],
    ['library-stats', id]
  ])
}

/** Items were added, changed or removed: refresh the grid and anything derived from it. */
function itemKeys(items: ItemLike[]): QueryKey[] {
  const libraryIds = new Set<string>()
  const keys: QueryKey[] = [['library-items'], ['items-in-progress']]

  for (const item of items) {
    const id = asString(item?.id)
    const libraryId = asString(item?.libraryId)
    if (id) keys.push(['item', id])
    if (libraryId) libraryIds.add(libraryId)
  }

  return [...keys, ...libraryContentKeys(libraryIds)]
}

function toItemArray(payload: unknown): ItemLike[] {
  if (Array.isArray(payload)) return payload as ItemLike[]
  if (payload && typeof payload === 'object') return [payload as ItemLike]
  return []
}

/**
 * The whole event -> invalidation table, as a pure function so it can be
 * unit-tested without a socket, a server or a QueryClient.
 *
 * Returns the query keys that a given event makes stale. Keys are prefixes:
 * `['library-items']` matches every sort/filter/pagination variant of the
 * library grid, `['item', id]` matches exactly one item's detail query.
 */
export function keysForEvent(event: string, payload: unknown): QueryKey[] {
  switch (event) {
    case 'item_added':
    case 'item_updated':
    case 'item_removed':
    case 'items_added':
    case 'items_updated':
      return itemKeys(toItemArray(payload))

    // A library's own settings/folders changed, or one appeared or vanished.
    // `['libraries']` feeds the sidebar and every library-scoped page.
    case 'library_added':
    case 'library_updated':
    case 'library_removed': {
      const libraryId = asString((payload as ItemLike | undefined)?.id)
      return [['libraries'], ...libraryContentKeys(new Set(libraryId ? [libraryId] : []))]
    }

    // A scan can add, update or remove anything in the library — the same
    // broad refresh as an item event, but without a specific item id.
    case 'task_finished': {
      const libraryId = asString((payload as { data?: { libraryId?: unknown } } | undefined)?.data?.libraryId)
      return [['library-items'], ['items-in-progress'], ['libraries'], ...libraryContentKeys(new Set(libraryId ? [libraryId] : []))]
    }

    // Progress moved on some device. The store patch (see `applyProgress`) is
    // what updates progress bars already on screen; these keys cover the
    // queries that carry progress server-side.
    case 'user_item_progress_updated': {
      const itemId = asString((payload as ProgressPayload | undefined)?.data?.libraryItemId)
      return [['library-items'], ['items-in-progress'], ...(itemId ? [['item', itemId] as QueryKey] : [])]
    }

    // Collections are library-wide and admin-curated; playlists are per-user.
    // Both carry the expanded record, so the detail query can be targeted.
    case 'collection_added':
    case 'collection_updated':
    case 'collection_removed': {
      const id = asString((payload as ItemLike | undefined)?.id)
      return [['collections'], ...(id ? [['collection', id] as QueryKey] : [])]
    }

    case 'playlist_added':
    case 'playlist_updated':
    case 'playlist_removed': {
      const id = asString((payload as ItemLike | undefined)?.id)
      return [['playlists'], ...(id ? [['playlist', id] as QueryKey] : [])]
    }

    // An author's name or book count changed. `['author', id]` backs the author
    // page; filterdata backs the sidebar's author list.
    case 'author_added':
    case 'author_updated':
    case 'author_removed': {
      const id = asString((payload as ItemLike | undefined)?.id)
      return [['library-filterdata'], ['library-items'], ...(id ? [['author', id] as QueryKey] : [])]
    }

    // Emitted by the scanner in one batch: `{ libraryId, authors: [...] }`.
    case 'authors_num_books_updated': {
      const authors = (payload as { authors?: ItemLike[] } | undefined)?.authors ?? []
      const keys: QueryKey[] = [['library-filterdata']]
      for (const author of authors) {
        const id = asString(author?.id)
        if (id) keys.push(['author', id])
      }
      return keys
    }

    // Series drive both the sidebar list and the series page's ordering.
    case 'series_added':
    case 'series_updated':
    case 'series_removed':
      return [['library-series'], ['series-books'], ['library-filterdata']]

    // Presence and live-stream changes, for the admin activity page.
    // `user_stream_update` also fires as a session's position is synced, which
    // is what keeps "listening now" honest without polling hard.
    case 'user_online':
    case 'user_offline':
    case 'user_stream_update':
      return [['users-online'], ['recent-sessions'], ['users']]

    // Handled by the player store — see the handler in `installSocketSync`.
    case 'user_session_closed':
      return []

    // Handled entirely by patching the auth store — no server query mirrors it.
    case 'user_updated':
      return []

    default:
      return []
  }
}

/**
 * Applies a progress event to the auth store.
 *
 * Exported for testing. Returns whether the payload was usable.
 */
export function applyProgress(payload: unknown): boolean {
  const progress = (payload as ProgressPayload | undefined)?.data
  const itemId = asString(progress?.libraryItemId)
  if (!progress || !itemId) return false
  useAuthStore.getState().setMediaProgress(itemId, progress as MediaProgress)
  return true
}

/**
 * True when a progress event came from this tab's own playback session.
 *
 * The player syncs every 15 seconds while playing, and the server echoes each
 * sync back to every client of that user — including this one. Refetching the
 * library grid on our own heartbeat would be a refetch every 15s for the whole
 * session. The store patch still runs (it is local and free, and keeps grid
 * progress bars moving live); only the network invalidation is skipped.
 */
function isOwnPlaybackSession(payload: unknown): boolean {
  const sessionId = asString((payload as ProgressPayload | undefined)?.sessionId)
  return !!sessionId && usePlayerStore.getState().session?.id === sessionId
}

/**
 * How long after a `user_stream_update` to re-check presence.
 *
 * `PlaybackSessionManager#closeSession` emits the event *before* it removes the
 * session from its in-memory list, so a refetch racing that event can still see
 * the stream it is announcing the end of. One short follow-up settles it,
 * instead of leaving a finished stream on the admin's screen until the next
 * poll. Server ordering is not ours to change.
 */
const STREAM_SETTLE_MS = 1_500

interface Coalescer {
  add: (keys: QueryKey[]) => void
  dispose: () => void
}

function createCoalescer(queryClient: QueryClient): Coalescer {
  const pending = new Map<string, QueryKey>()
  let timer: ReturnType<typeof setTimeout> | null = null

  function flush() {
    timer = null
    const keys = [...pending.values()]
    pending.clear()
    for (const queryKey of keys) {
      void queryClient.invalidateQueries({ queryKey })
    }
  }

  return {
    add(keys) {
      if (!keys.length) return
      // De-duplicated by serialized key, so one burst touching 200 books
      // collapses to the handful of distinct queries they share.
      for (const key of keys) pending.set(JSON.stringify(key), key)
      if (timer === null) timer = setTimeout(flush, COALESCE_MS)
    },
    dispose() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      pending.clear()
    }
  }
}

/**
 * Subscribes the app to live server events. Call once, from a component that
 * is mounted for the whole authenticated session; returns a teardown function.
 */
export function installSocketSync(queryClient: QueryClient): () => void {
  const socket = getSocket()
  const coalescer = createCoalescer(queryClient)
  const settleTimers = new Set<ReturnType<typeof setTimeout>>()

  const handlers = SYNCED_EVENTS.map((event) => {
    const handler = (payload: unknown) => {
      if (event === 'user_item_progress_updated') {
        applyProgress(payload)
        if (isOwnPlaybackSession(payload)) return
      }

      if (event === 'user_updated') {
        useAuthStore.getState().applyUserUpdate(payload)
        return
      }

      if (event === 'user_session_closed') {
        // Payload is the bare session id string, not an object.
        const sessionId = typeof payload === 'string' ? payload : asString((payload as { id?: unknown } | undefined)?.id)
        if (!sessionId) return
        // Returns false for this tab's own close, which needs no announcement.
        if (usePlayerStore.getState().handleSessionClosedRemotely(sessionId)) {
          toast.info('Playback stopped', { description: 'This listening session was closed somewhere else.' })
        }
        return
      }

      coalescer.add(keysForEvent(event, payload))

      if (event === 'user_stream_update') {
        // See STREAM_SETTLE_MS: the close case announces itself a moment early.
        const timer = setTimeout(() => {
          settleTimers.delete(timer)
          coalescer.add([['users-online']])
        }, STREAM_SETTLE_MS)
        settleTimers.add(timer)
      }
    }

    socket.on(event, handler)
    return [event, handler] as const
  })

  return () => {
    for (const [event, handler] of handlers) socket.off(event, handler)
    for (const timer of settleTimers) clearTimeout(timer)
    settleTimers.clear()
    coalescer.dispose()
  }
}

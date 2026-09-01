import type { QueryClient } from '@tanstack/react-query'
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
 * Scope is Tier 1 of docs/GAP-CLOSURE-PLAN.md lane B: items, libraries, and
 * the current user's progress/account. Podcast (`episode_*`), RSS (`rss_feed_*`)
 * and metadata-embed events are deliberately not subscribed — those features
 * are out of scope for this client (docs/PLAN.md), so listening to them would
 * only cost refetches for surfaces that don't exist.
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
  'user_updated'
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

      coalescer.add(keysForEvent(event, payload))
    }

    socket.on(event, handler)
    return [event, handler] as const
  })

  return () => {
    for (const [event, handler] of handlers) socket.off(event, handler)
    coalescer.dispose()
  }
}

import { api, coverUrl } from '@/lib/api'
import { trackUrl } from '@/lib/track-url'
import { getAppName } from '@/stores/auth'
import type { BookMediaMinified, LibraryItemMinified } from '@/types/abs'

/** Fixed params so download and removal always compute the same cache key for an item's cover. */
const OFFLINE_COVER_URL = (itemId: string) => coverUrl(itemId, { width: 500 })

/**
 * Offline listening: download an item's audio into the Cache API, and play
 * it back with no network at all. The service worker (`public/sw.js`, not
 * bundled — see its own header comment) intercepts requests to cached track
 * URLs and answers them, including Range requests for seeking, so the
 * player's normal `<audio src>` flow works completely unchanged once a track
 * is downloaded.
 *
 * This module owns the download itself and the small local manifest of
 * what's downloaded. `stores/player.ts` owns *playing* a downloaded item
 * (`playOffline` there) and reads this module's manifest to do it — kept
 * here rather than there so player.ts doesn't need to know about Cache API
 * or localStorage bookkeeping, just "is there an offline copy, and what's in
 * it."
 */

export const CACHE_NAME = 'athenaeum-offline-audio-v1'
const MANIFEST_KEY = 'athenaeum.offlineDownloads'
const PENDING_SYNC_KEY = 'athenaeum.offlinePendingSync'

export interface OfflineTrack {
  index: number
  startOffset: number
  duration: number
  contentUrl: string
  mimeType: string
}

export interface OfflineChapter {
  id: number
  start: number
  end: number
  title: string
}

export interface OfflineItemRecord {
  id: string
  title: string
  author: string
  duration: number
  tracks: OfflineTrack[]
  chapters: OfflineChapter[]
  downloadedAt: number
  totalBytes: number
}

interface PendingSyncEntry {
  currentTime: number
  timeListened: number
  updatedAt: number
}

/** Strips the token query param so a refreshed access token still lands on the same cache entry. Duplicated in sw.js — see that file's header for why. */
function cacheKeyFor(url: string): string {
  const u = new URL(url, window.location.origin)
  u.searchParams.delete('token')
  return u.toString()
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing or blocked/full storage — offline features degrade gracefully.
  }
}

export function getOfflineManifest(): Record<string, OfflineItemRecord> {
  return readJSON(MANIFEST_KEY, {})
}

function saveOfflineManifest(manifest: Record<string, OfflineItemRecord>) {
  writeJSON(MANIFEST_KEY, manifest)
}

export function hasOfflineCopy(itemId: string): boolean {
  return Boolean(getOfflineManifest()[itemId])
}

export function getOfflineItem(itemId: string): OfflineItemRecord | null {
  return getOfflineManifest()[itemId] ?? null
}

export function listOfflineItems(): OfflineItemRecord[] {
  return Object.values(getOfflineManifest()).sort((a, b) => b.downloadedAt - a.downloadedAt)
}

/**
 * A synthetic `LibraryItemMinified` for offline playback. `PlayerBar` and
 * `NowPlayingPage` require a non-null `item` to render at all, but only ever
 * read `id`/`updatedAt`/`media.metadata.{title,authorName}` off it — the
 * rest here is harmless filler that satisfies the type without claiming to
 * be real library data.
 */
export function offlineItemToLibraryItem(record: OfflineItemRecord): LibraryItemMinified {
  const media: BookMediaMinified = {
    id: record.id,
    metadata: {
      title: record.title,
      titleIgnorePrefix: record.title,
      subtitle: null,
      authorName: record.author,
      authorNameLF: record.author,
      narratorName: '',
      seriesName: '',
      genres: [],
      publishedYear: null,
      publishedDate: null,
      publisher: null,
      description: null,
      isbn: null,
      asin: null,
      language: null,
      explicit: false,
      abridged: false
    },
    coverPath: null,
    tags: [],
    numTracks: record.tracks.length,
    numAudioFiles: record.tracks.length,
    numChapters: record.chapters.length,
    duration: record.duration,
    size: record.totalBytes
  }

  return {
    id: record.id,
    ino: record.id,
    oldLibraryItemId: null,
    libraryId: '',
    folderId: '',
    path: '',
    relPath: '',
    isFile: false,
    mtimeMs: record.downloadedAt,
    ctimeMs: record.downloadedAt,
    birthtimeMs: record.downloadedAt,
    addedAt: record.downloadedAt,
    updatedAt: record.downloadedAt,
    isMissing: false,
    isInvalid: false,
    mediaType: 'book',
    media,
    numFiles: record.tracks.length,
    size: record.totalBytes
  }
}

/**
 * Downloads every track of `item` into the Cache API and records it in the
 * local manifest. Starting a session is the only way to learn the real
 * track list (see the module doc on `stores/player.ts` — start offsets and
 * content URLs are computed fresh server-side, never stored), so this mints
 * one via `/play` just like starting real playback does, then immediately
 * closes it — a download shouldn't linger as a phantom "listening" session
 * in admin activity.
 */
export async function downloadItem(item: LibraryItemMinified, onProgress?: (fraction: number) => void): Promise<void> {
  const appName = getAppName()
  const deviceInfo = { clientName: appName, clientVersion: '0.1.0', deviceId: `${appName.toLowerCase().replace(/\s+/g, '-')}-web-download` }

  const playSession = await api.post<{
    id: string
    displayTitle: string
    displayAuthor: string
    duration: number
    audioTracks: OfflineTrack[]
    chapters: OfflineChapter[]
  }>(`/items/${item.id}/play`, {
    deviceInfo,
    supportedMimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/ogg'],
    mediaPlayer: 'html5',
    forceDirectPlay: false,
    forceTranscode: false
  })

  try {
    await api.post(`/session/${playSession.id}/close`, { currentTime: 0, timeListened: 0, duration: playSession.duration })
  } catch {
    // Best-effort cleanup — a stray open session is a minor server-side
    // annoyance, not worth failing the whole download over.
  }

  if (!playSession.audioTracks?.length) throw new Error('This book has no playable audio tracks.')

  const cache = await caches.open(CACHE_NAME)
  let totalBytes = 0
  const total = playSession.audioTracks.length

  for (let i = 0; i < total; i++) {
    const track = playSession.audioTracks[i]
    const url = trackUrl(track)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Could not download track ${i + 1} of ${total}.`)
    totalBytes += Number(response.headers.get('content-length') ?? 0)
    await cache.put(cacheKeyFor(url), response.clone())
    onProgress?.((i + 1) / total)
  }

  // Cover art, best-effort — offline playback works fine without it. Fixed
  // params (no `ts` cache-buster) so removeOfflineItem() can reconstruct the
  // exact same cache key without having to remember what was used here.
  try {
    const url = OFFLINE_COVER_URL(item.id)
    const response = await fetch(url)
    if (response.ok) await cache.put(cacheKeyFor(url), response.clone())
  } catch {
    // Fine without a cached cover.
  }

  const manifest = getOfflineManifest()
  manifest[item.id] = {
    id: item.id,
    title: playSession.displayTitle,
    author: playSession.displayAuthor,
    duration: playSession.duration,
    tracks: playSession.audioTracks,
    chapters: playSession.chapters,
    downloadedAt: Date.now(),
    totalBytes
  }
  saveOfflineManifest(manifest)
}

/** Removes a downloaded item's cached audio/cover and its manifest entry. */
export async function removeOfflineItem(itemId: string): Promise<void> {
  const manifest = getOfflineManifest()
  const record = manifest[itemId]
  if (!record) return

  const cache = await caches.open(CACHE_NAME)
  for (const track of record.tracks) {
    await cache.delete(cacheKeyFor(trackUrl(track)))
  }
  await cache.delete(cacheKeyFor(OFFLINE_COVER_URL(itemId)))

  delete manifest[itemId]
  saveOfflineManifest(manifest)
}

// --- Reconciliation -------------------------------------------------------
//
// Offline playback can't call the server's sync endpoint (there's no
// network, and even when there is, an offline session has no real session
// id — see playOffline() in stores/player.ts). Progress made while offline
// queues here instead, keyed by item, and gets reported for real the next
// time the browser comes back online: mint a session with `/play` (same
// side-effecting call downloadItem() above already uses for the same
// "we just need the server to know" reason), then close it with the
// accumulated position — same shape a normal session-end sync would send.

function getPendingSync(): Record<string, PendingSyncEntry> {
  return readJSON(PENDING_SYNC_KEY, {})
}

function savePendingSync(pending: Record<string, PendingSyncEntry>) {
  writeJSON(PENDING_SYNC_KEY, pending)
}

/** Merges a chunk of offline listening into the queue — sums time listened, keeps the latest position. */
export function queueOfflinePendingSync(itemId: string, currentTime: number, timeListened: number) {
  const pending = getPendingSync()
  const existing = pending[itemId]
  pending[itemId] = {
    currentTime,
    timeListened: (existing?.timeListened ?? 0) + timeListened,
    updatedAt: Date.now()
  }
  savePendingSync(pending)
}

let flushing = false

/** Reports every queued offline listening session to the server. Safe to call opportunistically — no-ops with nothing queued, and leaves entries queued on failure (e.g. still actually offline). */
export async function flushPendingOfflineSync(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    const pending = getPendingSync()
    for (const [itemId, entry] of Object.entries(pending)) {
      try {
        const appName = getAppName()
        const session = await api.post<{ id: string; duration: number }>(`/items/${itemId}/play`, {
          deviceInfo: { clientName: appName, clientVersion: '0.1.0', deviceId: `${appName.toLowerCase().replace(/\s+/g, '-')}-web-offline-sync` },
          supportedMimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/ogg'],
          mediaPlayer: 'html5',
          forceDirectPlay: false,
          forceTranscode: false
        })
        await api.post(`/session/${session.id}/close`, {
          currentTime: entry.currentTime,
          timeListened: entry.timeListened,
          duration: session.duration
        })
        const remaining = getPendingSync()
        delete remaining[itemId]
        savePendingSync(remaining)
      } catch {
        // Still offline, or a transient failure — leave this one queued for the next attempt.
      }
    }
  } finally {
    flushing = false
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushPendingOfflineSync())
  // The tab may have loaded already back online after an offline listening session ended.
  if (navigator.onLine) void flushPendingOfflineSync()
}

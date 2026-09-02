import { create } from 'zustand'
import { api, getAccessToken } from '@/lib/api'
import { apiPath } from '@/lib/config'
import { getAppName } from '@/stores/auth'
import { encodeFilter } from '@/lib/filters'
import type { BookMediaMinified, BookMetadataExpanded, LibraryItemMinified } from '@/types/abs'

/**
 * Playback engine.
 *
 * Audiobookshelf models a book as an ordered list of audio tracks, each with a
 * `startOffset` into the whole book. The player exposes a single continuous
 * timeline ("global time") and maps it onto whichever track is loaded, so
 * chapters, progress and seeking all work the same whether a book is one file
 * or ninety.
 *
 * The <audio> element is a module singleton rather than React state: it must
 * survive route changes, and re-creating it would stop playback.
 */

export interface AudioTrack {
  index: number
  startOffset: number
  duration: number
  contentUrl: string
  mimeType: string
}

export interface Chapter {
  id: number
  start: number
  end: number
  title: string
}

interface PlaybackSession {
  id: string
  libraryItemId: string
  displayTitle: string
  displayAuthor: string
  duration: number
  currentTime: number
  audioTracks: AudioTrack[]
  chapters: Chapter[]
  playMethod: number
}

const RATE_STORAGE_KEY = 'voxsilo.playbackRate'
const VOLUME_STORAGE_KEY = 'voxsilo.volume'
const JUMP_BACKWARD_STORAGE_KEY = 'voxsilo.jumpBackwardAmount'
const JUMP_FORWARD_STORAGE_KEY = 'voxsilo.jumpForwardAmount'
/**
 * The playback session itself lives only in memory (see module doc), so a
 * reload always drops it. This key is the one thing that survives — just an
 * item id, written whenever a session starts and cleared on an explicit
 * close(), never on unmount. `ResumePrompt` reads it once on boot to offer
 * "Continue listening to X" instead of silently resuming audio the user
 * didn't ask to hear again.
 */
export const ACTIVE_ITEM_STORAGE_KEY = 'voxsilo.activeItemId'

/**
 * Sessions this tab closed itself.
 *
 * `close()` POSTs `/session/:id/close`, and the server echoes
 * `user_session_closed` back to every client of that user — including this
 * one. That echo can land while `close()` is still awaiting its final sync,
 * so the socket layer needs a way to tell "I closed this" from "something
 * else closed this on me". Ids are recorded on the way out and consumed once.
 */
const locallyClosedSessions = new Set<string>()

function readStoredItemId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ITEM_STORAGE_KEY)
  } catch {
    return null
  }
}
/** How often to report progress upstream while playing. */
const SYNC_INTERVAL_MS = 15_000

function readStored(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key)
    const value = raw ? Number(raw) : NaN
    return Number.isFinite(value) ? value : fallback
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Private browsing or blocked storage — playback still works.
  }
}

let audio: HTMLAudioElement | null = null
let syncTimer: ReturnType<typeof setInterval> | null = null
/** Seconds of real playback since the last successful sync. */
let listenedSinceSync = 0
let lastTickAt: number | null = null

let sleepTimerInterval: ReturnType<typeof setInterval> | null = null
/** The chapter id playback was in when "end of chapter" mode was armed — pause once we leave it. */
let sleepTimerArmedChapterId: number | null = null
/** Guards against a stale series lookup landing after the user has since moved on to a different book. */
let upNextRequestId = 0

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio()
    audio.preload = 'auto'
  }
  return audio
}

/**
 * Track URLs are authenticated, and an <audio> element cannot send headers.
 * The server accepts the access token as a query parameter for exactly this
 * reason (`ExtractJwt.fromUrlQueryParameter('token')` in Auth.js).
 */
function trackUrl(track: AudioTrack): string {
  const token = getAccessToken()
  const path = track.contentUrl.replace(/^\/api/, apiPath)
  return token ? `${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : path
}

interface PlayerState {
  session: PlaybackSession | null
  item: LibraryItemMinified | null
  trackIndex: number
  isPlaying: boolean
  isLoading: boolean
  /** Position on the whole-book timeline, in seconds. */
  currentTime: number
  duration: number
  playbackRate: number
  volume: number
  jumpBackwardAmount: number
  jumpForwardAmount: number
  error: string | null
  /** The item that was playing when this tab last loaded — null if none, or once dismissed. Captured once at boot; see ACTIVE_ITEM_STORAGE_KEY. */
  resumeItemId: string | null
  sleepTimerMode: 'duration' | 'chapter' | null
  /** Only meaningful in 'duration' mode — null in 'chapter' mode and when no timer is set. */
  sleepTimerSecondsRemaining: number | null
  /** The next book in series order, once the current one finishes — null otherwise. */
  upNext: LibraryItemMinified | null

  play: (item: LibraryItemMinified) => Promise<void>
  toggle: () => void
  seek: (globalTime: number) => void
  skip: (seconds: number) => void
  setRate: (rate: number) => void
  setVolume: (volume: number) => void
  setJumpBackwardAmount: (seconds: number) => void
  setJumpForwardAmount: (seconds: number) => void
  dismissResume: () => void
  jumpToChapter: (chapter: Chapter) => void
  nextChapter: () => void
  previousChapter: () => void
  setSleepTimerDuration: (minutes: number) => void
  setSleepTimerEndOfChapter: () => void
  cancelSleepTimer: () => void
  dismissUpNext: () => void
  close: () => Promise<void>
  /**
   * Applies the server's `user_session_closed`. Returns true when it actually
   * stopped this tab's playback, so the caller can decide whether to say so.
   */
  handleSessionClosedRemotely: (sessionId: string) => boolean
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  /** Reports position upstream; audiobookshelf derives progress and completion. */
  async function sync(final = false) {
    const { session, currentTime } = get()
    if (!session) return

    const timeListened = listenedSinceSync
    listenedSinceSync = 0

    try {
      await api.post(`/session/${session.id}/${final ? 'close' : 'sync'}`, {
        currentTime,
        timeListened,
        duration: session.duration
      })
    } catch {
      // Put the time back so a transient failure does not lose listening time.
      listenedSinceSync += timeListened
    }
  }

  function startSyncTimer() {
    if (syncTimer) return
    syncTimer = setInterval(() => {
      if (get().isPlaying) void sync()
    }, SYNC_INTERVAL_MS)
  }

  function stopSyncTimer() {
    if (syncTimer) {
      clearInterval(syncTimer)
      syncTimer = null
    }
  }

  function stopSleepTimer() {
    if (sleepTimerInterval) {
      clearInterval(sleepTimerInterval)
      sleepTimerInterval = null
    }
    sleepTimerArmedChapterId = null
  }

  function pauseForSleepTimer() {
    stopSleepTimer()
    set({ sleepTimerMode: null, sleepTimerSecondsRemaining: null })
    getAudio().pause()
  }

  /**
   * Looks up whether the item that just finished is part of a series with a
   * next entry, for the "up next" prompt. `metadata.series` only comes back
   * with real ids/sequences on the expanded item response (see
   * `Book.oldMetadataToJSON` server-side) — the minified shape used
   * everywhere else in the app just has a flattened `seriesName` string.
   */
  async function checkForNextInSeries(finishedItem: LibraryItemMinified) {
    const requestId = ++upNextRequestId
    try {
      const expanded = await api.get<{ media: { metadata: BookMetadataExpanded } }>(`/items/${finishedItem.id}?expanded=1`)
      const series = expanded.media.metadata.series?.find((s) => s.sequence)
      if (!series) return

      const params = new URLSearchParams({ limit: '200', minified: '1', sort: 'sequence', filter: encodeFilter('series', series.id) })
      const page = await api.get<{ results: LibraryItemMinified[] }>(`/libraries/${finishedItem.libraryId}/items?${params}`)

      // The user may have started something else entirely while this was in flight.
      if (requestId !== upNextRequestId || get().item?.id !== finishedItem.id) return

      const index = page.results.findIndex((b) => b.id === finishedItem.id)
      const next = index >= 0 ? page.results[index + 1] : undefined
      if (next) set({ upNext: next })
    } catch {
      // No series, a 404, or a network hiccup — either way, nothing to offer.
    }
  }

  /** Loads a track and positions it, without changing play/pause intent. */
  function loadTrack(index: number, offsetInTrack: number, autoplay: boolean) {
    const { session } = get()
    const track = session?.audioTracks[index]
    if (!track) return

    const element = getAudio()
    element.src = trackUrl(track)
    element.load()
    element.currentTime = Math.max(0, offsetInTrack)
    element.playbackRate = get().playbackRate
    element.volume = get().volume
    set({ trackIndex: index })
    if (autoplay) void element.play().catch(() => set({ isPlaying: false }))
  }

  function trackForTime(globalTime: number): number {
    return findTrackIndexForTime(get().session?.audioTracks ?? [], globalTime)
  }

  function attachListeners() {
    const element = getAudio()
    element.ontimeupdate = () => {
      const { session, trackIndex, isPlaying } = get()
      const track = session?.audioTracks[trackIndex]
      if (!track) return

      // Accumulate wall-clock listening time, scaled by rate, for the sync
      // payload. Using deltas rather than element.currentTime keeps seeks from
      // inflating the total.
      const now = performance.now()
      if (isPlaying && lastTickAt !== null) {
        const delta = (now - lastTickAt) / 1000
        if (delta > 0 && delta < 5) listenedSinceSync += delta
      }
      lastTickAt = now

      const globalTime = track.startOffset + element.currentTime
      set({ currentTime: globalTime })

      // "End of chapter" mode: pause the instant playback leaves the chapter
      // it was armed in, rather than counting down a duration.
      if (sleepTimerArmedChapterId !== null) {
        const chapter = chapterAt(session?.chapters ?? [], globalTime)
        if (chapter?.id !== sleepTimerArmedChapterId) pauseForSleepTimer()
      }
    }

    element.onended = () => {
      const { session, trackIndex, item } = get()
      if (!session) return
      const next = trackIndex + 1
      if (next < session.audioTracks.length) {
        loadTrack(next, 0, true)
      } else {
        set({ isPlaying: false })
        void sync(true)
        if (item) void checkForNextInSeries(item)
      }
    }

    element.onplay = () => {
      lastTickAt = performance.now()
      set({ isPlaying: true })
      startSyncTimer()
    }

    element.onpause = () => {
      lastTickAt = null
      set({ isPlaying: false })
      void sync()
    }

    element.onerror = () => {
      set({ isPlaying: false, isLoading: false, error: 'Playback failed. The file may be missing or unsupported.' })
    }

    element.oncanplay = () => set({ isLoading: false })
    element.onwaiting = () => set({ isLoading: true })
  }

  /** Lets the OS media keys and lock screen drive playback. */
  function updateMediaSession(session: PlaybackSession, item: LibraryItemMinified) {
    if (!('mediaSession' in navigator)) return
    const media = item.media as BookMediaMinified

    navigator.mediaSession.metadata = new MediaMetadata({
      title: session.displayTitle,
      artist: session.displayAuthor,
      album: media.metadata.seriesName || undefined,
      artwork: [{ src: `${apiPath}/items/${item.id}/cover?width=512`, sizes: '512x512', type: 'image/jpeg' }]
    })

    navigator.mediaSession.setActionHandler('play', () => get().toggle())
    navigator.mediaSession.setActionHandler('pause', () => get().toggle())
    navigator.mediaSession.setActionHandler('seekbackward', () => get().skip(-get().jumpBackwardAmount))
    navigator.mediaSession.setActionHandler('seekforward', () => get().skip(get().jumpForwardAmount))
    navigator.mediaSession.setActionHandler('previoustrack', () => get().previousChapter())
    navigator.mediaSession.setActionHandler('nexttrack', () => get().nextChapter())
  }

  return {
    session: null,
    item: null,
    trackIndex: 0,
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    playbackRate: readStored(RATE_STORAGE_KEY, 1),
    volume: readStored(VOLUME_STORAGE_KEY, 1),
    jumpBackwardAmount: readStored(JUMP_BACKWARD_STORAGE_KEY, 15),
    jumpForwardAmount: readStored(JUMP_FORWARD_STORAGE_KEY, 30),
    error: null,
    resumeItemId: readStoredItemId(),
    sleepTimerMode: null,
    sleepTimerSecondsRemaining: null,
    upNext: null,

    async play(item) {
      const current = get()

      // Same book already loaded — treat as a play/pause toggle.
      if (current.session?.libraryItemId === item.id) {
        current.toggle()
        return
      }

      // Switching books: report the old position before abandoning the session.
      if (current.session) await sync(true)

      stopSleepTimer()
      set({ isLoading: true, error: null, item, sleepTimerMode: null, sleepTimerSecondsRemaining: null, upNext: null })

      try {
        const appName = getAppName()
        const session = await api.post<PlaybackSession>(`/items/${item.id}/play`, {
          deviceInfo: { clientName: appName, clientVersion: '0.1.0', deviceId: `${appName.toLowerCase().replace(/\s+/g, '-')}-web` },
          supportedMimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/ogg'],
          mediaPlayer: 'html5',
          forceDirectPlay: false,
          forceTranscode: false
        })

        if (!session.audioTracks?.length) {
          set({ isLoading: false, error: 'This book has no playable audio tracks.' })
          return
        }

        listenedSinceSync = 0
        lastTickAt = null
        set({
          session,
          duration: session.duration,
          currentTime: session.currentTime,
          isPlaying: false
        })

        attachListeners()
        const index = trackForTime(session.currentTime)
        loadTrack(index, session.currentTime - session.audioTracks[index].startOffset, true)
        updateMediaSession(session, item)
        try {
          localStorage.setItem(ACTIVE_ITEM_STORAGE_KEY, item.id)
        } catch {
          // Private browsing or blocked storage — resume-after-reload just won't work.
        }
      } catch (error) {
        set({ isLoading: false, error: error instanceof Error ? error.message : 'Could not start playback.' })
      }
    },

    toggle() {
      const element = getAudio()
      if (!get().session) return
      if (element.paused) void element.play().catch(() => set({ isPlaying: false }))
      else element.pause()
    },

    seek(globalTime) {
      const { session } = get()
      if (!session) return

      const clamped = Math.max(0, Math.min(globalTime, session.duration))
      const index = trackForTime(clamped)
      const track = session.audioTracks[index]

      if (index !== get().trackIndex) {
        loadTrack(index, clamped - track.startOffset, !getAudio().paused)
      } else {
        getAudio().currentTime = clamped - track.startOffset
      }
      set({ currentTime: clamped })
    },

    skip(seconds) {
      get().seek(get().currentTime + seconds)
    },

    setRate(rate) {
      getAudio().playbackRate = rate
      writeStored(RATE_STORAGE_KEY, rate)
      set({ playbackRate: rate })
    },

    setVolume(volume) {
      getAudio().volume = volume
      writeStored(VOLUME_STORAGE_KEY, volume)
      set({ volume })
    },

    setJumpBackwardAmount(seconds) {
      writeStored(JUMP_BACKWARD_STORAGE_KEY, seconds)
      set({ jumpBackwardAmount: seconds })
    },

    setJumpForwardAmount(seconds) {
      writeStored(JUMP_FORWARD_STORAGE_KEY, seconds)
      set({ jumpForwardAmount: seconds })
    },

    dismissResume() {
      try {
        localStorage.removeItem(ACTIVE_ITEM_STORAGE_KEY)
      } catch {
        // Ignore — worst case it prompts again next reload.
      }
      set({ resumeItemId: null })
    },

    setSleepTimerDuration(minutes) {
      stopSleepTimer()
      set({ sleepTimerMode: 'duration', sleepTimerSecondsRemaining: Math.round(minutes * 60) })
      sleepTimerInterval = setInterval(() => {
        const remaining = (get().sleepTimerSecondsRemaining ?? 0) - 1
        if (remaining <= 0) {
          pauseForSleepTimer()
        } else {
          set({ sleepTimerSecondsRemaining: remaining })
        }
      }, 1000)
    },

    setSleepTimerEndOfChapter() {
      stopSleepTimer()
      const { session, currentTime } = get()
      const chapter = chapterAt(session?.chapters ?? [], currentTime)
      // No chapter data (or not currently in one) — nothing to arm against.
      if (!chapter) return
      sleepTimerArmedChapterId = chapter.id
      set({ sleepTimerMode: 'chapter', sleepTimerSecondsRemaining: null })
    },

    cancelSleepTimer() {
      stopSleepTimer()
      set({ sleepTimerMode: null, sleepTimerSecondsRemaining: null })
    },

    dismissUpNext() {
      set({ upNext: null })
    },

    jumpToChapter(chapter) {
      get().seek(chapter.start)
    },

    nextChapter() {
      const { session, currentTime } = get()
      const next = session?.chapters.find((c) => c.start > currentTime + 1)
      if (next) get().seek(next.start)
    },

    previousChapter() {
      const { session, currentTime } = get()
      const chapters = session?.chapters ?? []
      // Restart the current chapter unless already near its start, which is the
      // behaviour people expect from a "previous" button.
      const currentIndex = chapters.findIndex((c) => currentTime >= c.start && currentTime < c.end)
      if (currentIndex < 0) return
      const chapter = chapters[currentIndex]
      if (currentTime - chapter.start > 3 || currentIndex === 0) get().seek(chapter.start)
      else get().seek(chapters[currentIndex - 1].start)
    },

    async close() {
      const element = getAudio()
      const closingId = get().session?.id
      // Recorded before the await: the server's echo of this close can arrive
      // while sync(true) is still in flight.
      if (closingId) locallyClosedSessions.add(closingId)
      element.pause()
      stopSyncTimer()
      stopSleepTimer()
      await sync(true)
      element.removeAttribute('src')
      element.load()
      try {
        localStorage.removeItem(ACTIVE_ITEM_STORAGE_KEY)
      } catch {
        // Ignore — see setItem above.
      }
      set({ session: null, item: null, isPlaying: false, currentTime: 0, duration: 0, error: null, resumeItemId: null, sleepTimerMode: null, sleepTimerSecondsRemaining: null, upNext: null })
    },

    handleSessionClosedRemotely(sessionId) {
      // Our own close, echoed back — already handled by close() itself.
      if (locallyClosedSessions.delete(sessionId)) return false

      const { session, item } = get()
      if (!session || session.id !== sessionId) return false

      // The session no longer exists server-side, so every further sync would
      // fail and the position would stop being recorded. Stop cleanly and fall
      // back to the same "Continue listening?" prompt a reload produces, rather
      // than leaving audio playing against a dead session.
      const element = getAudio()
      element.pause()
      stopSyncTimer()
      stopSleepTimer()
      element.removeAttribute('src')
      element.load()
      set({ session: null, isPlaying: false, currentTime: 0, duration: 0, sleepTimerMode: null, sleepTimerSecondsRemaining: null, upNext: null, resumeItemId: item?.id ?? null, item: null })
      return true
    }
  }
})

/** Chapter containing a given time, for labelling the player. */
export function chapterAt(chapters: Chapter[], time: number): Chapter | null {
  return chapters.find((c) => time >= c.start && time < c.end) ?? null
}

/**
 * Maps a position on the whole-book timeline to which track contains it —
 * the core of the track/global-time mapping the module doc describes.
 * Assumes `tracks` is ordered by `startOffset` ascending, which is how the
 * server always returns them. Out-of-range times (negative, or past the
 * last track) clamp to the nearest real track rather than returning -1.
 */
export function findTrackIndexForTime(tracks: AudioTrack[], globalTime: number): number {
  for (let i = tracks.length - 1; i >= 0; i--) {
    if (globalTime >= tracks[i].startOffset) return i
  }
  return 0
}

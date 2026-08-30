import { create } from 'zustand'
import { api, getAccessToken } from '@/lib/api'
import { apiPath } from '@/lib/config'
import type { BookMediaMinified, LibraryItemMinified } from '@/types/abs'

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
  error: string | null

  play: (item: LibraryItemMinified) => Promise<void>
  toggle: () => void
  seek: (globalTime: number) => void
  skip: (seconds: number) => void
  setRate: (rate: number) => void
  setVolume: (volume: number) => void
  jumpToChapter: (chapter: Chapter) => void
  nextChapter: () => void
  previousChapter: () => void
  close: () => Promise<void>
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
    const tracks = get().session?.audioTracks ?? []
    for (let i = tracks.length - 1; i >= 0; i--) {
      if (globalTime >= tracks[i].startOffset) return i
    }
    return 0
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

      set({ currentTime: track.startOffset + element.currentTime })
    }

    element.onended = () => {
      const { session, trackIndex } = get()
      if (!session) return
      const next = trackIndex + 1
      if (next < session.audioTracks.length) {
        loadTrack(next, 0, true)
      } else {
        set({ isPlaying: false })
        void sync(true)
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
    navigator.mediaSession.setActionHandler('seekbackward', () => get().skip(-15))
    navigator.mediaSession.setActionHandler('seekforward', () => get().skip(30))
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
    error: null,

    async play(item) {
      const current = get()

      // Same book already loaded — treat as a play/pause toggle.
      if (current.session?.libraryItemId === item.id) {
        current.toggle()
        return
      }

      // Switching books: report the old position before abandoning the session.
      if (current.session) await sync(true)

      set({ isLoading: true, error: null, item })

      try {
        const session = await api.post<PlaybackSession>(`/items/${item.id}/play`, {
          deviceInfo: { clientName: 'VoxSilo', clientVersion: '0.1.0', deviceId: 'voxsilo-web' },
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
      element.pause()
      stopSyncTimer()
      await sync(true)
      element.removeAttribute('src')
      element.load()
      set({ session: null, item: null, isPlaying: false, currentTime: 0, duration: 0, error: null })
    }
  }
})

/** Chapter containing a given time, for labelling the player. */
export function chapterAt(chapters: Chapter[], time: number): Chapter | null {
  return chapters.find((c) => time >= c.start && time < c.end) ?? null
}

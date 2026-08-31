import { describe, expect, it } from 'vitest'
import { chapterAt, findTrackIndexForTime } from './player'
import type { AudioTrack, Chapter } from './player'

function track(index: number, startOffset: number): AudioTrack {
  return { index, startOffset, duration: 0, contentUrl: '', mimeType: 'audio/mpeg' }
}

describe('findTrackIndexForTime', () => {
  it('returns 0 for an empty track list', () => {
    expect(findTrackIndexForTime([], 500)).toBe(0)
  })

  it('returns the only track for a single-file book at any time', () => {
    const tracks = [track(0, 0)]
    expect(findTrackIndexForTime(tracks, 0)).toBe(0)
    expect(findTrackIndexForTime(tracks, 99999)).toBe(0)
  })

  const tracks = [track(0, 0), track(1, 1000), track(2, 2500)]

  it('finds the right track for a time in the middle of it', () => {
    expect(findTrackIndexForTime(tracks, 1500)).toBe(1)
  })

  it('treats a track boundary as belonging to the track that starts there', () => {
    expect(findTrackIndexForTime(tracks, 1000)).toBe(1)
    expect(findTrackIndexForTime(tracks, 2500)).toBe(2)
  })

  it('clamps a negative time to the first track rather than returning -1', () => {
    expect(findTrackIndexForTime(tracks, -5)).toBe(0)
  })

  it('clamps a time past the last track to the last track', () => {
    expect(findTrackIndexForTime(tracks, 999999)).toBe(2)
  })
})

describe('chapterAt', () => {
  const chapters: Chapter[] = [
    { id: 0, start: 0, end: 100, title: 'Opening Credits' },
    { id: 1, start: 100, end: 5000, title: 'Chapter 1' },
    { id: 2, start: 5000, end: 5010, title: 'End Credits' }
  ]

  it('finds the chapter containing a time in its middle', () => {
    expect(chapterAt(chapters, 2500)?.title).toBe('Chapter 1')
  })

  it('treats a chapter boundary as the start of the next chapter, not the end of the previous one', () => {
    expect(chapterAt(chapters, 100)?.title).toBe('Chapter 1')
  })

  it('returns null for a time past the last chapter', () => {
    expect(chapterAt(chapters, 10000)).toBeNull()
  })

  it('returns null for an empty chapter list', () => {
    expect(chapterAt([], 50)).toBeNull()
  })
})

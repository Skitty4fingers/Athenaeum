import { describe, expect, it } from 'vitest'
import { formatBytes, formatClock, formatDuration } from './format'

describe('formatDuration', () => {
  it('formats minutes only under an hour', () => {
    expect(formatDuration(41 * 60)).toBe('41m')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration(9 * 3600 + 41 * 60)).toBe('9h 41m')
  })

  it('drops a zero minutes remainder', () => {
    expect(formatDuration(2 * 3600)).toBe('2h')
  })

  it('rolls a rounded 60-minute remainder into the next hour', () => {
    // 1h + 59m30s rounds the minutes component to 60 — this is the case the
    // source comment calls out explicitly ("9h 60m" would be wrong).
    expect(formatDuration(3600 + 59 * 60 + 30)).toBe('2h')
  })

  it('returns the placeholder for zero, negative, null, undefined, and non-finite input', () => {
    expect(formatDuration(0)).toBe('--')
    expect(formatDuration(-5)).toBe('--')
    expect(formatDuration(null)).toBe('--')
    expect(formatDuration(undefined)).toBe('--')
    expect(formatDuration(Infinity)).toBe('--')
    expect(formatDuration(NaN)).toBe('--')
  })
})

describe('formatClock', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatClock(4 * 60 + 5)).toBe('4:05')
  })

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatClock(3662)).toBe('1:01:02')
  })

  it('pads minutes and seconds but not hours', () => {
    expect(formatClock(3600 + 5)).toBe('1:00:05')
  })

  it('truncates rather than rounds', () => {
    expect(formatClock(59.9)).toBe('0:59')
  })

  it('returns 0:00 for zero, negative, null, undefined, and non-finite input', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-1)).toBe('0:00')
    expect(formatClock(null)).toBe('0:00')
    expect(formatClock(undefined)).toBe('0:00')
    expect(formatClock(Infinity)).toBe('0:00')
  })
})

describe('formatBytes', () => {
  it('formats bytes below 1024 with no decimal', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('picks the right unit and rounds large values to whole numbers', () => {
    expect(formatBytes(683_939_581)).toBe('652 MB')
  })

  it('shows one decimal place for small values in a unit above bytes', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('returns the placeholder for zero, negative, null, and undefined', () => {
    expect(formatBytes(0)).toBe('--')
    expect(formatBytes(-100)).toBe('--')
    expect(formatBytes(null)).toBe('--')
    expect(formatBytes(undefined)).toBe('--')
  })
})

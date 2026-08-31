import { describe, expect, it } from 'vitest'
import { decodeFilter, encodeFilter, filterLabel } from './filters'

describe('encodeFilter / decodeFilter', () => {
  it('round-trips a plain ASCII value', () => {
    const encoded = encodeFilter('genres', 'Fantasy')
    expect(encoded).toBe('genres.RmFudGFzeQ==')
    expect(decodeFilter(encoded)).toEqual({ group: 'genres', value: 'Fantasy' })
  })

  it('round-trips non-ASCII characters', () => {
    // The reason base64 goes through TextEncoder rather than plain btoa —
    // btoa throws on anything outside Latin-1, and author/genre names are
    // real-world UTF-8 text.
    const encoded = encodeFilter('authors', 'Jorge Luis Borges (José)')
    expect(decodeFilter(encoded)).toEqual({ group: 'authors', value: 'Jorge Luis Borges (José)' })
  })

  it('round-trips an emoji', () => {
    const encoded = encodeFilter('tags', '🎧 favorites')
    expect(decodeFilter(encoded)).toEqual({ group: 'tags', value: '🎧 favorites' })
  })

  it('returns null for a null or empty filter', () => {
    expect(decodeFilter(null)).toBeNull()
    expect(decodeFilter(undefined)).toBeNull()
    expect(decodeFilter('')).toBeNull()
  })

  it('returns null for an unrecognised group', () => {
    expect(decodeFilter('notagroup.aGVsbG8=')).toBeNull()
  })

  it('returns null rather than throwing on malformed base64', () => {
    // A hand-edited or truncated URL should degrade to "no filter", not crash the page.
    expect(decodeFilter('genres.not-valid-base64!!!')).toBeNull()
  })
})

describe('filterLabel', () => {
  it('maps known progress values to their display label', () => {
    expect(filterLabel(encodeFilter('progress', 'in-progress'))).toBe('In progress')
    expect(filterLabel(encodeFilter('progress', 'finished'))).toBe('Finished')
    expect(filterLabel(encodeFilter('progress', 'not-started'))).toBe('Not started')
    expect(filterLabel(encodeFilter('progress', 'not-finished'))).toBe('Not finished')
  })

  it('falls back to the raw value for an unrecognised progress value', () => {
    expect(filterLabel(encodeFilter('progress', 'mystery-status'))).toBe('mystery-status')
  })

  it('returns the decoded value directly for every other group', () => {
    expect(filterLabel(encodeFilter('genres', 'Horror'))).toBe('Horror')
    // The `authors` group encodes an id, not a name — filterLabel has no
    // server data to resolve that against, so it's expected to hand back
    // the raw id here. Callers that need the real name (LibraryPage) resolve
    // it separately against library stats.
    expect(filterLabel(encodeFilter('authors', 'author-id-123'))).toBe('author-id-123')
  })

  it('returns null when there is no active filter', () => {
    expect(filterLabel(null)).toBeNull()
  })
})

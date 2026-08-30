/**
 * Library filter encoding.
 *
 * The server expects `filter=<group>.<base64(value)>` and decodes it with
 * `Buffer.from(decodeURIComponent(text), 'base64').toString()` — i.e. UTF-8.
 * `btoa` only handles Latin-1, so genre or author names with non-ASCII
 * characters must be encoded through TextEncoder first or they corrupt.
 */

export const FILTER_GROUPS = ['genres', 'tags', 'series', 'authors', 'progress', 'narrators', 'publishers', 'publishedDecades', 'missing', 'languages', 'tracks', 'ebooks'] as const

export type FilterGroup = (typeof FILTER_GROUPS)[number]

/** Values accepted by the `progress` group (see libraryItemsBookFilters.js). */
export type ProgressFilter = 'in-progress' | 'finished' | 'not-started' | 'not-finished'

function base64Encode(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64Decode(value: string): string {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeFilter(group: FilterGroup, value: string): string {
  return `${group}.${base64Encode(value)}`
}

export function decodeFilter(filter: string | null | undefined): { group: FilterGroup; value: string } | null {
  if (!filter) return null
  const group = FILTER_GROUPS.find((g) => filter.startsWith(`${g}.`))
  if (!group) return null
  try {
    return { group, value: base64Decode(filter.slice(group.length + 1)) }
  } catch {
    // A hand-edited or truncated URL should fall back to "no filter" rather
    // than throwing during render.
    return null
  }
}

/** Human-readable label for the active filter, for headings and empty states. */
export function filterLabel(filter: string | null | undefined): string | null {
  const decoded = decodeFilter(filter)
  if (!decoded) return null

  if (decoded.group === 'progress') {
    const labels: Record<string, string> = {
      'in-progress': 'In progress',
      finished: 'Finished',
      'not-started': 'Not started',
      'not-finished': 'Not finished'
    }
    return labels[decoded.value] ?? decoded.value
  }
  return decoded.value
}

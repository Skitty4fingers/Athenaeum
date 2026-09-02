/**
 * Series ordering health.
 *
 * Reading order comes from each book's `sequence` within a series. When books
 * are added without a `metadata.json` (an in-app upload, a manual copy), the
 * scanner falls back to ID3 SERIES/PART tags, which are routinely missing for
 * part of a set or repeated across it — so a series silently displays in an
 * arbitrary order with nothing on screen saying why.
 *
 * This is the detection half (docs/GAP-CLOSURE-PLAN.md lane C1): pure, so it
 * can be unit-tested without a server, and cheap enough to run on data
 * SeriesPage has already loaded.
 */

export interface SeriesOrderHealth {
  /** Books carrying no usable sequence at all. */
  missingCount: number
  /** Sequences shared by more than one book, with how many books share each. */
  duplicates: { sequence: string; count: number }[]
  /** Books considered — the denominator for any "N of M" phrasing. */
  total: number
  /** True when every book has a sequence and no two collide. */
  isOrdered: boolean
}

/**
 * Groups sequences that would sort identically.
 *
 * "1" and "1.0" are the same position even though the strings differ, so
 * numeric-looking values key on their parsed value; anything else (a roman
 * numeral, "Book Two") keys on its trimmed, case-folded text.
 */
function orderKey(sequence: string): string {
  const trimmed = sequence.trim()
  const asNumber = Number(trimmed)
  return Number.isFinite(asNumber) && trimmed !== '' ? `n:${asNumber}` : `s:${trimmed.toLowerCase()}`
}

function isBlank(sequence: string | null | undefined): boolean {
  return sequence == null || sequence.trim() === ''
}

/**
 * Analyses one series' sequences.
 *
 * A single-book series is always "ordered" — one book cannot be out of order
 * with itself, and flagging it would put a warning on every standalone title
 * the scanner happened to file under a series name.
 */
export function analyzeSeriesOrder(sequences: readonly (string | null | undefined)[]): SeriesOrderHealth {
  const total = sequences.length
  const missingCount = sequences.filter(isBlank).length

  const counts = new Map<string, { sequence: string; count: number }>()
  for (const sequence of sequences) {
    if (isBlank(sequence)) continue
    const key = orderKey(sequence!)
    const existing = counts.get(key)
    if (existing) existing.count += 1
    else counts.set(key, { sequence: sequence!.trim(), count: 1 })
  }

  const duplicates = [...counts.values()].filter((entry) => entry.count > 1).sort((a, b) => b.count - a.count || a.sequence.localeCompare(b.sequence))

  return {
    missingCount,
    duplicates,
    total,
    isOrdered: total <= 1 || (missingCount === 0 && duplicates.length === 0)
  }
}

/** One-line summary for the health banner. Null when there is nothing to report. */
export function describeSeriesOrder(health: SeriesOrderHealth): string | null {
  if (health.isOrdered) return null

  const parts: string[] = []
  if (health.missingCount > 0) {
    parts.push(`${health.missingCount} of ${health.total} book${health.total === 1 ? '' : 's'} ${health.missingCount === 1 ? 'has' : 'have'} no position`)
  }
  if (health.duplicates.length > 0) {
    const shared = health.duplicates.map((d) => `#${d.sequence}`).join(', ')
    parts.push(`${health.duplicates.length === 1 ? 'position' : 'positions'} ${shared} ${health.duplicates.length === 1 ? 'is' : 'are'} used more than once`)
  }
  // Sentence-case the first clause without touching the rest.
  const sentence = parts.join(', and ')
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.'
}


/** Minimal shape of a series membership, as the API returns it. */
export interface SeriesMembership {
  id?: string
  name: string
  sequence: string | null
}

/**
 * Sets one series' sequence while preserving every other membership.
 *
 * The server matches series by *name* and replaces a book's series list
 * wholesale (`updateSeriesFromRequest`), so any write has to send the complete
 * list — dropping an entry deletes that membership. Both write paths that
 * touch a sequence (the series order editor and the upload flow) go through
 * here so that hazard lives in one tested place.
 *
 * `matches` identifies the series to change: by id where the caller has one,
 * by name where the series may have just been created by a scan.
 */
export function withSequenceForSeries(existing: readonly SeriesMembership[], matches: (series: SeriesMembership) => boolean, sequence: string): { name: string; sequence: string | null }[] {
  return existing.map((series) => ({
    name: series.name,
    sequence: matches(series) ? sequence : series.sequence
  }))
}

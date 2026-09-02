import { describe, expect, it } from 'vitest'
import { analyzeSeriesOrder, describeSeriesOrder, withSequenceForSeries } from './series'

describe('analyzeSeriesOrder', () => {
  it('reports a fully sequenced series as ordered', () => {
    const health = analyzeSeriesOrder(['1', '2', '3'])
    expect(health.isOrdered).toBe(true)
    expect(health.missingCount).toBe(0)
    expect(health.duplicates).toEqual([])
    expect(describeSeriesOrder(health)).toBeNull()
  })

  it('does not require sequences to be contiguous or start at 1', () => {
    // Gaps are legitimate — a library may hold books 2, 5 and 6 of a series.
    expect(analyzeSeriesOrder(['2', '5', '6']).isOrdered).toBe(true)
  })

  it('accepts decimal sequences, which novellas really use', () => {
    expect(analyzeSeriesOrder(['1', '1.5', '2']).isOrdered).toBe(true)
  })

  it('counts blank, null and undefined sequences as missing', () => {
    const health = analyzeSeriesOrder(['1', null, undefined, '   ', '2'])
    expect(health.missingCount).toBe(3)
    expect(health.isOrdered).toBe(false)
  })

  it('flags sequences shared by more than one book', () => {
    const health = analyzeSeriesOrder(['1', '2', '2', '3'])
    expect(health.duplicates).toEqual([{ sequence: '2', count: 2 }])
    expect(health.isOrdered).toBe(false)
  })

  it('treats numerically equal sequences as the same position', () => {
    // "1" and "1.0" sort identically, so they collide even though the strings differ.
    const health = analyzeSeriesOrder(['1', '1.0'])
    expect(health.duplicates).toHaveLength(1)
    expect(health.duplicates[0].count).toBe(2)
  })

  it('ignores surrounding whitespace when comparing', () => {
    expect(analyzeSeriesOrder([' 1 ', '1']).duplicates).toHaveLength(1)
  })

  it('compares non-numeric sequences case-insensitively', () => {
    const health = analyzeSeriesOrder(['Book One', 'book one'])
    expect(health.duplicates).toHaveLength(1)
  })

  it('keeps distinct non-numeric sequences separate', () => {
    expect(analyzeSeriesOrder(['I', 'II', 'III']).isOrdered).toBe(true)
  })

  it('never flags a single-book series', () => {
    // One book cannot be out of order with itself; flagging it would warn on
    // every standalone the scanner filed under a series name.
    expect(analyzeSeriesOrder([null]).isOrdered).toBe(true)
    expect(analyzeSeriesOrder([]).isOrdered).toBe(true)
  })

  it('reports missing and duplicate problems together', () => {
    const health = analyzeSeriesOrder(['1', '1', null])
    expect(health.missingCount).toBe(1)
    expect(health.duplicates).toEqual([{ sequence: '1', count: 2 }])
  })

  it('orders duplicates by how many books collide', () => {
    const health = analyzeSeriesOrder(['1', '1', '1', '2', '2'])
    expect(health.duplicates.map((d) => d.sequence)).toEqual(['1', '2'])
    expect(health.duplicates[0].count).toBe(3)
  })
})

describe('describeSeriesOrder', () => {
  it('describes missing positions with correct agreement', () => {
    expect(describeSeriesOrder(analyzeSeriesOrder(['1', null]))).toBe('1 of 2 books has no position.')
    expect(describeSeriesOrder(analyzeSeriesOrder(['1', null, null]))).toBe('2 of 3 books have no position.')
  })

  it('describes duplicate positions', () => {
    expect(describeSeriesOrder(analyzeSeriesOrder(['2', '2']))).toBe('Position #2 is used more than once.')
    expect(describeSeriesOrder(analyzeSeriesOrder(['1', '1', '2', '2']))).toBe('Positions #1, #2 are used more than once.')
  })

  it('combines both problems into one sentence', () => {
    expect(describeSeriesOrder(analyzeSeriesOrder(['1', '1', null]))).toBe('1 of 3 books has no position, and position #1 is used more than once.')
  })
})

describe('withSequenceForSeries', () => {
  const memberships = [
    { id: 'a', name: 'Main Saga', sequence: '2' },
    { id: 'b', name: 'Side Stories', sequence: '3' }
  ]

  it('changes only the matched series', () => {
    expect(withSequenceForSeries(memberships, (s) => s.id === 'a', '1')).toEqual([
      { name: 'Main Saga', sequence: '1' },
      { name: 'Side Stories', sequence: '3' }
    ])
  })

  it('keeps every other membership — dropping one would delete it server-side', () => {
    // updateSeriesFromRequest replaces the list wholesale, so an omitted entry
    // is a removed series. This is the property the whole helper exists for.
    const result = withSequenceForSeries(memberships, (s) => s.id === 'a', '1')
    expect(result.map((s) => s.name)).toEqual(['Main Saga', 'Side Stories'])
  })

  it('can match by name, for a series the caller has no id for', () => {
    const result = withSequenceForSeries(memberships, (s) => s.name.toLowerCase() === 'side stories', '9')
    expect(result).toEqual([
      { name: 'Main Saga', sequence: '2' },
      { name: 'Side Stories', sequence: '9' }
    ])
  })

  it('preserves a null sequence on series it does not touch', () => {
    const withNull = [
      { id: 'a', name: 'One', sequence: null },
      { id: 'b', name: 'Two', sequence: null }
    ]
    expect(withSequenceForSeries(withNull, (s) => s.id === 'b', '5')).toEqual([
      { name: 'One', sequence: null },
      { name: 'Two', sequence: '5' }
    ])
  })

  it('is a no-op when nothing matches', () => {
    expect(withSequenceForSeries(memberships, () => false, '7')).toEqual([
      { name: 'Main Saga', sequence: '2' },
      { name: 'Side Stories', sequence: '3' }
    ])
  })

  it('handles an empty list', () => {
    expect(withSequenceForSeries([], () => true, '1')).toEqual([])
  })
})

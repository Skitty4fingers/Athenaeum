import { describe, expect, it } from 'vitest'
import { analyzeSeriesOrder, describeSeriesOrder } from './series'

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

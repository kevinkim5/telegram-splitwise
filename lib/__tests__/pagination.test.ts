import { describe, expect, it } from 'vitest'
import { pageCount, parsePage, rangeLabel } from '@/lib/pagination'

describe('pagination', () => {
  it('counts pages, at least one even when empty', () => {
    expect(pageCount(0, 50)).toBe(1)
    expect(pageCount(50, 50)).toBe(1)
    expect(pageCount(51, 50)).toBe(2)
    expect(pageCount(137, 50)).toBe(3)
  })

  it('reads and clamps the page from the query string', () => {
    expect(parsePage(undefined, 137, 50)).toBe(1)
    expect(parsePage('2', 137, 50)).toBe(2)
    expect(parsePage('99', 137, 50)).toBe(3)   // past the end: the last page
    expect(parsePage('0', 137, 50)).toBe(1)
    expect(parsePage('-3', 137, 50)).toBe(1)
    expect(parsePage('abc', 137, 50)).toBe(1)
    expect(parsePage('2.5', 137, 50)).toBe(1)
    expect(parsePage('2; DROP TABLE', 137, 50)).toBe(1)
    expect(parsePage('1', 0, 50)).toBe(1)
  })

  it('labels the range shown', () => {
    expect(rangeLabel(1, 137, 50)).toBe('1–50 of 137')
    expect(rangeLabel(3, 137, 50)).toBe('101–137 of 137')
    expect(rangeLabel(1, 0, 50)).toBe('0 of 0')
  })
})

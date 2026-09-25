import { describe, expect, it } from 'vitest'
import { countOf, formatCount } from './counts'

// Contract gate 6 (product owner, 2026-09-25): the course search counts only to 10,000 and flags a
// count it stopped at; the console reads that one as "10,000+".
describe('formatCount', () => {
  it('groups an exact count and adds nothing', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(42)).toBe('42')
    expect(formatCount(1250)).toBe('1,250')
    expect(formatCount(10000, false)).toBe('10,000')
  })

  it('reads a capped count as "N+"', () => {
    expect(formatCount(10000, true)).toBe('10,000+')
  })
})

describe('countOf', () => {
  it('picks the noun by the count', () => {
    expect(countOf(1, false, 'course')).toBe('1 course')
    expect(countOf(0, undefined, 'course')).toBe('0 courses')
    expect(countOf(1250, false, 'result')).toBe('1,250 results')
    expect(countOf(2, false, 'campus', 'campuses')).toBe('2 campuses')
  })

  it('a capped count is plural and "+"', () => {
    expect(countOf(10000, true, 'course')).toBe('10,000+ courses')
    expect(countOf(1, true, 'course')).toBe('1+ courses')
  })
})

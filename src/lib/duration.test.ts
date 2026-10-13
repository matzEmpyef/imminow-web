import { describe, expect, it } from 'vitest'
import { hoursInWords } from './duration'

describe('hoursInWords', () => {
  it('reads long spans as days and hours', () => {
    expect(hoursInWords(2862)).toBe('119 days 6 hours')
    expect(hoursInWords(72)).toBe('3 days')
    expect(hoursInWords(49)).toBe('2 days 1 hour')
  })

  it('keeps short spans in hours', () => {
    expect(hoursInWords(0.2)).toBe('less than an hour')
    expect(hoursInWords(1)).toBe('1 hour')
    expect(hoursInWords(47.6)).toBe('2 days')
    expect(hoursInWords(30)).toBe('30 hours')
  })
})

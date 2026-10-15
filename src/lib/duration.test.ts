import { describe, expect, it } from 'vitest'
import { daysInWords, hoursInWords } from './duration'

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

describe('daysInWords', () => {
  it('puts a space before the unit and agrees with the count', () => {
    expect(daysInWords(40)).toBe('40 days')
    expect(daysInWords(5)).toBe('5 days')
    expect(daysInWords(1)).toBe('1 day')
    expect(daysInWords(0)).toBe('0 days')
    expect(daysInWords(4.6)).toBe('5 days')
  })
})

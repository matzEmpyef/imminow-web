import { describe, expect, it } from 'vitest'
import { localDateISO } from './time'

// The bug this helper exists for (2026-09-12): "today" was taken from toISOString(), the UTC
// date, so in India every date default read as yesterday between midnight and 05:30.
describe('localDateISO', () => {
  it('reads the calendar date on the local clock, not UTC', () => {
    // 00:30 local time — in any zone east of UTC, toISOString() would still say the 11th.
    expect(localDateISO(new Date(2026, 8, 12, 0, 30))).toBe('2026-09-12')
    expect(localDateISO(new Date(2026, 8, 12, 23, 59))).toBe('2026-09-12')
  })

  it('pads the month and day', () => {
    expect(localDateISO(new Date(2027, 0, 5))).toBe('2027-01-05')
  })

  it('defaults to now', () => {
    const now = new Date()
    expect(localDateISO()).toBe(localDateISO(now))
  })
})

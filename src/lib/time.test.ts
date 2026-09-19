import { describe, expect, it } from 'vitest'
import { formatDate, localDateISO } from './time'

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

// Assumptions audit C13 (approved 2026-09-19): `new Date("2026-03-15")` is UTC midnight, and
// reading it back with the local getters this helper uses showed 14/03/2026 to anyone west of
// UTC — every deadline, grace end and due date a day early. A date-only string is now read as
// text, so the rendering no longer depends on where the browser is.
describe('formatDate', () => {
  it('renders a date-only string verbatim, with no timezone shift', () => {
    expect(formatDate('2026-03-15')).toBe('15/03/2026')
    expect(formatDate('2026-01-01')).toBe('01/01/2026')
    expect(formatDate('2026-12-31')).toBe('31/12/2026')
  })

  it('still treats a value carrying a time as an instant on the local clock', () => {
    expect(formatDate(new Date(2026, 2, 15, 9, 0))).toBe('15/03/2026')
    expect(formatDate(new Date(2026, 2, 15, 9, 0).toISOString())).toBe('15/03/2026')
  })
})

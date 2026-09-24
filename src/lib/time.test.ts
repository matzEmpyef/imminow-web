import { describe, expect, it } from 'vitest'
import { daysSince, daysUntil, formatDate, localDateISO, relativeTime, timeAgo } from './time'

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

// Assumptions audit M38 (product owner, 2026-09-19): the console had four rounding rules for
// "days" — floor here, round in relativeTime, ceil inline on two pages, a raw fraction on a
// third — so the same gap read "1 day" in a column and "2d ago" in the cell beside it.
describe('days', () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000).toISOString()
  const hoursAhead = (h: number) => new Date(Date.now() + h * 3600000).toISOString()

  it('floors elapsed days — a day has passed only once it has', () => {
    expect(daysSince(hoursAgo(5))).toBe(0)
    expect(daysSince(hoursAgo(23))).toBe(0)
    expect(daysSince(hoursAgo(36))).toBe(1)
    expect(daysSince(hoursAgo(49))).toBe(2)
  })

  it('never reports a negative elapsed count for a future timestamp', () => {
    expect(daysSince(hoursAhead(10))).toBe(0)
  })

  it('ceils remaining days — anything still to come is at least a day away', () => {
    expect(daysUntil(hoursAhead(4))).toBe(1)
    expect(daysUntil(hoursAhead(25))).toBe(2)
  })

  it('agrees with relativeTime, which used to round', () => {
    expect(relativeTime(hoursAgo(36))).toBe(`${daysSince(hoursAgo(36))}d ago`)
    expect(relativeTime(hoursAgo(36))).toBe('1d ago')
  })
})

// Phase 5 (W-DUP-12): Notifications and Active Leads' hour-grained label, moved here unchanged.
describe('timeAgo', () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
  const HOUR = 60 * 60 * 1000

  it('reads anything under an hour as "just now", not in minutes', () => {
    expect(timeAgo(ago(0))).toBe('just now')
    expect(timeAgo(ago(59 * 60 * 1000))).toBe('just now')
  })

  it('counts whole hours under a day, then whole days', () => {
    expect(timeAgo(ago(HOUR + 1000))).toBe('1h ago')
    expect(timeAgo(ago(23 * HOUR + 1000))).toBe('23h ago')
    expect(timeAgo(ago(47 * HOUR + 1000))).toBe('1d ago')
    expect(timeAgo(ago(49 * HOUR))).toBe('2d ago')
  })
})

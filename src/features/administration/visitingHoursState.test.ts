import { describe, expect, it } from 'vitest'
import { visitingHoursStateFrom, visitingScheduleFrom } from './visitingHoursState'

// The round trip the Profile tab's Visiting hours editor depends on (assumptions audit H12,
// approved 2026-09-19). Two rules matter and neither is visible from the component: a day nobody
// switched on is absent from `days` rather than sent as a closed one, and a schedule with no days
// at all is `null` — the server refuses an empty `days` array, and null is how "we have not set
// our own hours, use the platform default" is said.
describe('visitingHoursStateFrom', () => {
  it('turns a saved schedule into seven rows, closed days included', () => {
    const state = visitingHoursStateFrom({
      timezone: 'Asia/Dubai',
      days: [{ weekday: 0, open: '09:00', close: '13:00' }],
    })
    expect(state.timezone).toBe('Asia/Dubai')
    expect(state.days).toHaveLength(7)
    expect(state.days[0]).toEqual({ open: true, from: '09:00', to: '13:00' })
    expect(state.days[1].open).toBe(false)
  })

  it('reads no schedule as every day closed', () => {
    const state = visitingHoursStateFrom(null)
    expect(state.days.every((d) => !d.open)).toBe(true)
    // The browser's own zone is a suggestion to edit, never a stored answer.
    expect(state.timezone).toBeTruthy()
  })
})

describe('visitingScheduleFrom', () => {
  it('sends only the days that are open, numbered Sunday-first', () => {
    const state = visitingHoursStateFrom(null)
    state.timezone = 'Asia/Kolkata'
    state.days[6] = { open: true, from: '10:00', to: '17:00' }
    expect(visitingScheduleFrom(state)).toEqual({
      timezone: 'Asia/Kolkata',
      days: [{ weekday: 6, open: '10:00', close: '17:00' }],
    })
  })

  it('sends null when no day is open, rather than an empty day list the server refuses', () => {
    expect(visitingScheduleFrom(visitingHoursStateFrom(null))).toBeNull()
  })
})

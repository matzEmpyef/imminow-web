import { describe, expect, it } from 'vitest'
import { caseMovedBannerMessage, clientStatusLabel, closeSubReasonLabel, displayStatusOf, isCaseMoved, isPlanComplete } from './clientStatus'
import { auditValue, reasonText } from './auditWords'

// Case-moved read-only state (product owner 2026-09-24) — a `closed_switched` case belongs to
// another consultancy now, and every consultancy-side write 409s `case_moved` except internal
// notes. These two functions are the one place that decides "is this case ours to touch any
// more?" and what the banner says about it, so the profile page, its tabs and the clients list
// all draw the same line from the same source.
describe('isCaseMoved', () => {
  it('is true only for closed_switched', () => {
    expect(isCaseMoved('closed_switched')).toBe(true)
    expect(isCaseMoved('closed')).toBe(false)
    expect(isCaseMoved('in_dispute')).toBe(false)
    expect(isCaseMoved('in_plan')).toBe(false)
    expect(isCaseMoved(null)).toBe(false)
    expect(isCaseMoved(undefined)).toBe(false)
  })
})

describe('caseMovedBannerMessage', () => {
  it('is null for a case that has not moved', () => {
    expect(caseMovedBannerMessage({ status: 'in_plan', closed_at: '2026-09-20' })).toBeNull()
    expect(caseMovedBannerMessage({ status: 'closed', closed_at: '2026-09-20' })).toBeNull()
  })

  it('names the destination "another consultancy" — the Client schema has no transferred_to', () => {
    const message = caseMovedBannerMessage({ status: 'closed_switched', closed_at: null })
    expect(message).toBe("This case moved to another consultancy. You can still read its history and add internal notes. Nothing else can be changed.")
  })

  it('adds the date from closed_at when the server sent one', () => {
    const message = caseMovedBannerMessage({ status: 'closed_switched', closed_at: '2026-09-20' })
    expect(message).toBe(
      "This case moved to another consultancy on 20-09-2026. You can still read its history and add internal notes. Nothing else can be changed.",
    )
  })
})

// Owner, DECISIONS 145d: a case closed because the student's date of birth showed they are under 16.
describe('a case closed as under age', () => {
  it('is named "Under 16" wherever a close reason is read', () => {
    expect(closeSubReasonLabel('under_age')).toBe('Under 16')
    expect(auditValue('under_age')).toBe('under 16')
    expect(reasonText('under_age')).toBe('Under 16')
  })
})

// A case whose every plan step is done still has the status `in_plan` (a finished plan does not
// finish the case), so the header and lists read it from the step count: "Plan complete".
describe('isPlanComplete', () => {
  it('is true when an in-plan case has every step done', () => {
    expect(isPlanComplete({ status: 'in_plan', progress: '4/4' })).toBe(true)
    expect(isPlanComplete({ status: 'in_plan', progress: '0/0', case_summary: { plan_progress: '7/7' } })).toBe(true)
    expect(clientStatusLabel(displayStatusOf({ status: 'in_plan', progress: '4/4' }))).toBe('Plan complete')
  })

  it('stays "In plan" while a step is open, with no plan, and for other statuses', () => {
    expect(isPlanComplete({ status: 'in_plan', progress: '3/4' })).toBe(false)
    expect(isPlanComplete({ status: 'in_plan', progress: '0/0' })).toBe(false)
    expect(isPlanComplete({ status: 'in_plan', progress: '3/4', case_summary: { plan_progress: null } })).toBe(false)
    expect(isPlanComplete({ status: 'pending_plan_assignment', progress: '4/4' })).toBe(false)
    expect(isPlanComplete({ status: 'closed', progress: '4/4' })).toBe(false)
    expect(clientStatusLabel(displayStatusOf({ status: 'in_plan', progress: '3/4' }))).toBe('In plan')
  })
})

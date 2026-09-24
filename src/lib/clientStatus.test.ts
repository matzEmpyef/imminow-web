import { describe, expect, it } from 'vitest'
import { caseMovedBannerMessage, isCaseMoved } from './clientStatus'

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
    expect(message).toBe("This case moved to another consultancy — you can read its history, but it's read-only now.")
  })

  it('adds the date from closed_at when the server sent one', () => {
    const message = caseMovedBannerMessage({ status: 'closed_switched', closed_at: '2026-09-20' })
    expect(message).toBe(
      "This case moved to another consultancy on 20/09/2026 — you can read its history, but it's read-only now.",
    )
  })
})

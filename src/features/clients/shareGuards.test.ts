import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { DUPLICATE_SHARE_MESSAGE, duplicateShareMessage, isRepeatOfLastShare } from './shareGuards'
import { consoleDroppedFilters } from './courseFinderState'

// Chat UX (product owner, 2026-09-19): the server refuses a repeat share with 409
// `duplicate_share`; the console stops offering the action so the refusal is a race, not a
// routine, and shows the sentence beside the composer when it does happen.
describe('duplicateShareMessage', () => {
  it('prefers the server’s own wording', () => {
    const error = new ApiError('Could not send this search.', {
      error: { code: 'duplicate_share', message: "You just shared this — it's already in the conversation." },
    })
    expect(duplicateShareMessage(error)).toBe("You just shared this — it's already in the conversation.")
  })

  it('falls back to our sentence when the refusal carries no message', () => {
    const error = new ApiError(DUPLICATE_SHARE_MESSAGE, { error: { code: 'duplicate_share' } })
    expect(duplicateShareMessage(error)).toBe(DUPLICATE_SHARE_MESSAGE)
  })

  it('passes anything else through unchanged', () => {
    expect(duplicateShareMessage(new Error('Network down'))).toBe('Network down')
  })
})

describe('isRepeatOfLastShare', () => {
  const courseShare = { type: 'course_share', sender: 'consultant', shared_course: { id: 'c1' } }

  it('is true only for the very last message', () => {
    expect(isRepeatOfLastShare([courseShare], 'consultant', { kind: 'course', id: 'c1' })).toBe(true)
    expect(
      isRepeatOfLastShare([courseShare, { type: 'text', sender: 'consultant' }], 'consultant', {
        kind: 'course',
        id: 'c1',
      }),
    ).toBe(false)
  })

  it('is false for a different course, or the other side', () => {
    expect(isRepeatOfLastShare([courseShare], 'consultant', { kind: 'course', id: 'c2' })).toBe(false)
    expect(isRepeatOfLastShare([courseShare], 'student', { kind: 'course', id: 'c1' })).toBe(false)
  })

  it('compares a search by its filters, whatever order they are in', () => {
    const messages = [
      { type: 'search_share', sender: 'consultant', shared_search: { filters: { country: 'Canada', level: 'masters' } } },
    ]
    expect(
      isRepeatOfLastShare(messages, 'consultant', { kind: 'search', filters: { level: 'masters', country: 'Canada' } }),
    ).toBe(true)
    expect(isRepeatOfLastShare(messages, 'consultant', { kind: 'search', filters: { country: 'Canada' } })).toBe(false)
  })

  it('has nothing to repeat in an empty thread', () => {
    expect(isRepeatOfLastShare(undefined, 'consultant', { kind: 'course', id: 'c1' })).toBe(false)
  })
})

// Assumptions audit M30/M39 (product owner, 2026-09-19): a search opened from chat used to widen
// silently — "Masters, Canada, scholarships, Jan intake, Toronto" became every Masters in Canada.
describe('consoleDroppedFilters', () => {
  const levels = ['diploma', 'bachelors', 'masters']

  it('drops nothing when every filter can travel', () => {
    expect(
      consoleDroppedFilters({ country: 'Canada', level: 'masters', intake: 'first_half', scholarship: 'true' }, levels),
    ).toEqual([])
  })

  it('accepts a level in any case, because a link may carry either', () => {
    expect(consoleDroppedFilters({ level: 'Masters' }, levels)).toEqual([])
  })

  it('names a level the catalogue does not hold instead of searching for it', () => {
    expect(consoleDroppedFilters({ level: 'PG_Diploma' }, levels)).toEqual(['Level (PG_Diploma)'])
  })

  it('does not judge the level until the list has loaded', () => {
    expect(consoleDroppedFilters({ level: 'PG_Diploma' }, undefined)).toEqual([])
  })

  it('names an enum value it has no option for', () => {
    expect(consoleDroppedFilters({ intake: 'may', study_mode: 'block', delivery: 'blended' }, levels)).toEqual([
      'Intake (may)',
      'Study mode (block)',
      'Delivery (blended)',
    ])
  })

  it('names a key it has no idea about at all', () => {
    expect(consoleDroppedFilters({ accreditation: 'aacsb' }, levels)).toEqual(['Accreditation'])
  })

  it('drops a fee cap that arrived without its currency, and keeps one that did not', () => {
    expect(consoleDroppedFilters({ fee_max: '2000000' }, levels)).toEqual(['Fee cap (no currency was sent with it)'])
    expect(consoleDroppedFilters({ fee_max: '2000000', fee_currency: 'INR' }, levels)).toEqual([])
  })

  it('names a duration range that matches none of its buckets', () => {
    expect(consoleDroppedFilters({ duration_min_months: '13', duration_max_months: '24' }, levels)).toEqual([])
    expect(consoleDroppedFilters({ duration_min_months: '18', duration_max_months: '20' }, levels)).toEqual([
      'Duration (not one of the ranges this search offers)',
    ])
  })
})

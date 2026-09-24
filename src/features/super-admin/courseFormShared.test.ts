import { describe, expect, it } from 'vitest'
import { aptitudeRequiredFromServer, intakeStatusLabel } from './courseFormShared'

// An intake's status is derived by the server from its deadline and set by nobody (product owner,
// 2026-09-24); the console only words it. Pinned so every screen that shows it says the same.
describe('intakeStatusLabel', () => {
  it('names the date an open intake is open until', () => {
    expect(intakeStatusLabel('open', '2027-03-31')).toBe('Open until 31/03/2027')
  })

  it('says "Open" alone when an open intake somehow carries no date', () => {
    expect(intakeStatusLabel('open', null)).toBe('Open')
  })

  it('words closed and unknown as what they mean, not as a decision someone made', () => {
    expect(intakeStatusLabel('closed', '2026-01-15')).toBe('Deadline passed')
    expect(intakeStatusLabel('unknown', null)).toBe('No deadline')
  })

  it('returns null for an absent or unrecognised status rather than guessing one', () => {
    expect(intakeStatusLabel(undefined, '2027-03-31')).toBeNull()
    expect(intakeStatusLabel('waitlist' as never, '2027-03-31')).toBeNull()
  })
})

describe('aptitudeRequiredFromServer', () => {
  it('maps explicitly, in both directions', () => {
    expect(aptitudeRequiredFromServer(true)).toBe('required')
    expect(aptitudeRequiredFromServer(false)).toBe('optional')
  })

  it('never defaults an unanswered exam to required', () => {
    expect(aptitudeRequiredFromServer(undefined)).toBe('')
    expect(aptitudeRequiredFromServer(null)).toBe('')
  })
})

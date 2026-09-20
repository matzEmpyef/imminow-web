import { describe, expect, it } from 'vitest'
import { aptitudeRequiredFromServer, intakeStatusFromServer } from './courseFormShared'

// Assumptions audit M37 (product owner, 2026-09-19).
describe('intakeStatusFromServer', () => {
  it('loads the known statuses as themselves', () => {
    expect(intakeStatusFromServer('open')).toBe('open')
    expect(intakeStatusFromServer('closed')).toBe('closed')
    expect(intakeStatusFromServer('unknown')).toBe('unknown')
  })

  it('reads an absent status as "nobody has said", never as open', () => {
    expect(intakeStatusFromServer(undefined)).toBe('unknown')
    expect(intakeStatusFromServer(null)).toBe('unknown')
    expect(intakeStatusFromServer('')).toBe('unknown')
  })

  it('carries a status this build does not know through untouched, so it round-trips', () => {
    expect(intakeStatusFromServer('waitlist')).toBe('waitlist')
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

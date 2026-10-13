import { describe, expect, it } from 'vitest'
import { directoryStanding, employeeStanding } from './employeeStanding'

// T1-13: "Invited" until the person accepts; the two lists read the same words.
describe('employeeStanding (a consultancy roster row)', () => {
  it('reads a person who has never signed in as invited', () => {
    expect(employeeStanding({ active: true, detail: 'full', user: { last_login_at: null } })).toBe('invited')
  })
  it('reads a person who has signed in as active', () => {
    expect(employeeStanding({ active: true, detail: 'full', user: { last_login_at: '2026-10-01T09:00:00Z' } })).toBe(
      'active',
    )
  })
  it('reads a switched-off person as disabled, and a switched-off invitation as withdrawn', () => {
    expect(employeeStanding({ active: false, user: { last_login_at: '2026-10-01T09:00:00Z' } })).toBe('disabled')
    expect(employeeStanding({ active: false, user: { last_login_at: null } })).toBe('withdrawn')
  })
  it('does not guess from a summary row, which carries no sign-in time', () => {
    expect(employeeStanding({ active: true, detail: 'summary', user: { last_login_at: null } })).toBe('active')
  })
})

describe('directoryStanding (the platform directory)', () => {
  const row = { active: true, invited_at: '2026-10-01T09:00:00Z', accepted_at: null }
  it('is invited while an invitation is open', () => {
    expect(directoryStanding(row)).toBe('invited')
    expect(directoryStanding({ ...row, accepted_at: '2026-10-02T09:00:00Z' })).toBe('active')
  })
  it('does not call a person with no invitation on record invited', () => {
    expect(directoryStanding({ active: true, invited_at: null, accepted_at: null })).toBe('active')
    expect(directoryStanding({ active: false, invited_at: null, accepted_at: null })).toBe('disabled')
  })
  it('reads a withdrawn invitation as withdrawn', () => {
    expect(directoryStanding({ ...row, active: false })).toBe('withdrawn')
  })
})

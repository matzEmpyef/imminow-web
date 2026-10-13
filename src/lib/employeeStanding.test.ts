import { describe, expect, it } from 'vitest'
import { directoryStanding, employeeStanding } from './employeeStanding'

// T1-13: "Invited" until the person accepts; the two lists read the same words.
describe('employeeStanding (a consultancy roster row)', () => {
  it('reads the status the server serves', () => {
    expect(employeeStanding({ status: 'invited', active: true })).toBe('invited')
    expect(employeeStanding({ status: 'active', active: true })).toBe('active')
    expect(employeeStanding({ status: 'deactivated', active: false })).toBe('disabled')
  })
  it('does not guess from a sign-in time: an active person who has not signed in yet is active', () => {
    expect(
      employeeStanding({ status: 'active', active: true, user: { last_login_at: null } } as never),
    ).toBe('active')
  })
  it('falls back to the plain switch when a row carries no status', () => {
    expect(employeeStanding({ active: true })).toBe('active')
    expect(employeeStanding({ active: false })).toBe('disabled')
    expect(employeeStanding({})).toBe('active')
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

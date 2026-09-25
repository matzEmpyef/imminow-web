import { describe, expect, it } from 'vitest'
import { ceilingState } from './listCeilings'

// The count against the ceiling (product owner, 2026-09-25): "12 of 100 tags", and at the ceiling
// a reason instead of a dead button. The numbers come from `Consultancy.limits`, never from here.
describe('ceilingState', () => {
  it('reads "N of M" below the ceiling, with nothing disabled', () => {
    expect(ceilingState('tags', 12, 100)).toEqual({ label: '12 of 100 tags', atLimit: false, reason: undefined })
    expect(ceilingState('designations', 3, 50)?.label).toBe('3 of 50 designations')
    expect(ceilingState('branches', 0, 100)?.label).toBe('0 of 100 branches')
  })

  it('at the ceiling says why creating is off, in the singular', () => {
    expect(ceilingState('tags', 100, 100)).toEqual({
      label: '100 of 100 tags',
      atLimit: true,
      reason: "You've reached the 100-tag limit.",
    })
    expect(ceilingState('designations', 50, 50)?.reason).toBe("You've reached the 50-designation limit.")
    expect(ceilingState('branches', 100, 100)?.reason).toBe("You've reached the 100-branch limit.")
  })

  it('treats a list already past the ceiling as at it (a ceiling lowered under existing rows)', () => {
    expect(ceilingState('tags', 104, 100)?.atLimit).toBe(true)
  })

  it('says nothing while either side is unknown, so nothing is disabled on a guess', () => {
    expect(ceilingState('tags', undefined, 100)).toBeNull()
    expect(ceilingState('tags', 12, undefined)).toBeNull()
  })
})

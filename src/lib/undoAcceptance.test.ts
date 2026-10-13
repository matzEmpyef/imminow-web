import { describe, expect, it } from 'vitest'
import { canUndoAcceptance } from './undoAcceptance'

const staff = (over: Record<string, unknown> = {}) => ({
  is_admin: false,
  employee_id: 'e-me',
  permissions: [] as string[],
  ...over,
})

describe('who is offered "Undo acceptance"', () => {
  it('the admin, whoever the client is assigned to', () => {
    expect(canUndoAcceptance(staff({ is_admin: true }), 'e-other')).toBe(true)
  })

  it('the consultant the client is assigned to, with no permission', () => {
    expect(canUndoAcceptance(staff(), 'e-me')).toBe(true)
  })

  it('a holder of clients.revert_acceptance on a client assigned to someone else', () => {
    expect(canUndoAcceptance(staff({ permissions: ['clients.close', 'clients.revert_acceptance'] }), 'e-other')).toBe(true)
  })

  it('nobody else', () => {
    expect(canUndoAcceptance(staff({ permissions: ['clients.close'] }), 'e-other')).toBe(false)
    expect(canUndoAcceptance(staff(), undefined)).toBe(false)
    expect(canUndoAcceptance(staff(), null)).toBe(false)
  })

  it('no one until the signed-in person is known', () => {
    expect(canUndoAcceptance(undefined, 'e-me')).toBe(false)
    expect(canUndoAcceptance(null, 'e-me')).toBe(false)
  })
})

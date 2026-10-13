import { describe, expect, it } from 'vitest'
import { PERMISSION_GROUPS, withoutUnusablePermissions } from './permissions'

// T4-22: a checklist never offers a switch for something the plan cannot do.
describe('withoutUnusablePermissions', () => {
  const keys = (groups: typeof PERMISSION_GROUPS) => groups.flatMap((g) => g.permissions.map((p) => p.key))

  it('drops the transfer permission on a plan without Applicant Transfer', () => {
    const shown = withoutUnusablePermissions(PERMISSION_GROUPS, () => false)
    expect(keys(shown)).not.toContain('clients.transfer_applicant')
    expect(keys(shown)).toContain('leads.view_own')
  })

  it('keeps it where the plan has the feature', () => {
    const shown = withoutUnusablePermissions(PERMISSION_GROUPS, (key) => key === 'applicant_transfer')
    expect(keys(shown)).toContain('clients.transfer_applicant')
  })
})

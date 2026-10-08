import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner decision 6 (review F-055, 2026-10-07): converting a lead into a client is its own staff
// permission, `leads.convert`. Pinned here: who is offered "Convert to Client" and the answer to
// a student's request, and that the permission appears in both permission editors with the other
// Leads permissions, under the contract's label and helper text.
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))
vi.mock('@/queries/staff', () => ({
  useUpdateDesignation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { useMe } from '@/queries/me'
import { meAnswered, meLoading, staffMe } from '@/test/me'
import { DesignationPermissionsModal } from '@/features/administration/DesignationPermissionsModal'
import type { components } from '@/api/schema'
import { useCanConvertLead } from './convertRules'
import { PERMISSION_GROUPS, visiblePermissionGroups } from './permissions'

type Designation = components['schemas']['Designation']

const mockedMe = vi.mocked(useMe)

function canConvert(origin: string, staff: Parameters<typeof staffMe>[0]) {
  mockedMe.mockReturnValue(meAnswered(staffMe(staff)))
  return renderHook(() => useCanConvertLead({ origin })).result.current
}

beforeEach(() => {
  mockedMe.mockReset()
})

describe('who may convert a lead', () => {
  it('a lead from the app: the convert permission, and nothing else', () => {
    expect(canConvert('sentpo', { permissions: ['leads.convert'] })).toBe(true)
    expect(canConvert('sentpo', { permissions: ['leads.view_all', 'clients.create_applicant'] })).toBe(false)
  })

  it('a lead the consultancy added itself also needs Create Applicant, the permission and the plan feature', () => {
    const both = ['leads.convert', 'clients.create_applicant']
    expect(canConvert('imported', { permissions: both, features: ['create_applicant'] })).toBe(true)
    expect(canConvert('imported', { permissions: both, features: [] })).toBe(false)
    expect(canConvert('imported', { permissions: ['leads.convert'], features: ['create_applicant'] })).toBe(false)
    expect(canConvert('imported', { permissions: ['clients.create_applicant'], features: ['create_applicant'] })).toBe(false)
  })

  it('fails closed until the permissions are known', () => {
    mockedMe.mockReturnValue(meLoading())
    expect(renderHook(() => useCanConvertLead({ origin: 'sentpo' })).result.current).toBe(false)
  })
})

describe('the convert permission in the editors', () => {
  it('sits with the other Leads permissions, after Delete leads', () => {
    const leads = PERMISSION_GROUPS.find((g) => g.key === 'leads')!
    const keys = leads.permissions.map((p) => p.key)
    expect(keys.indexOf('leads.convert')).toBe(keys.indexOf('leads.delete') + 1)
    expect(leads.permissions.find((p) => p.key === 'leads.convert')).toMatchObject({ label: 'Convert leads to clients' })
  })

  it('is listed under Leads when the server serves it, not under "Other permissions"', () => {
    const groups = visiblePermissionGroups(['leads.view_own', 'leads.convert'])
    expect(groups.map((g) => g.label)).toEqual(['Leads'])
  })

  it('shows in the designation editor with its helper text, as a switch like the others', () => {
    mockedMe.mockReturnValue(
      meAnswered(staffMe({ is_admin: true, available_permissions: ['leads.view_own', 'leads.convert'] })),
    )
    const designation = {
      id: 'des-1',
      name: 'Counsellor',
      protected: false,
      permissions: { 'leads.view_own': true, 'leads.convert': true },
    } as unknown as Designation
    render(<DesignationPermissionsModal designation={designation} />)
    fireEvent.click(screen.getByRole('button', { name: 'View permissions for Counsellor' }))

    expect(screen.getByRole('switch', { name: 'Convert leads to clients' })).toBeChecked()
    expect(
      screen.getByText(
        'Send a lead the offer to become a client, and approve or decline a student’s own request. Applies only to leads this person can see.',
      ),
    ).toBeInTheDocument()
  })
})

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// `usePermissionChecker` answers from `GET /me` (review F-036): the caller's own permission keys,
// decided by the server. It no longer downloads the employee list or the designations, which is
// what cost the newest staff of a large consultancy every screen (the list is paged at 100). It
// still has to tell "still loading" and "the read failed" apart from "genuinely no" — a
// regression there flashes a denial at people who have the permission (the bug PermissionGate
// exists to prevent).
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))
vi.mock('@/queries/staff', () => ({ useEmployees: vi.fn(), useDesignations: vi.fn() }))

import { useMe } from '@/queries/me'
import { useEmployees, useDesignations } from '@/queries/staff'
import { meAnswered, meFailed, meLoading, meRefused, meSignedOut, plainMe, platformMe, staffMe } from '@/test/me'
import {
  PERMISSION_GROUPS,
  permissionGroupsFor,
  permissionKeys,
  pickPermissions,
  useAvailablePermissions,
  usePermission,
  usePermissionChecker,
  visiblePermissionGroups,
} from './permissions'

const mockedMe = vi.mocked(useMe)
const ALL_KEYS = permissionKeys(PERMISSION_GROUPS)

function checker(state: ReturnType<typeof useMe>) {
  mockedMe.mockReturnValue(state)
  return renderHook(() => usePermissionChecker()).result.current
}

describe('usePermissionChecker', () => {
  it('answers each key from the permissions the server lists for the caller', () => {
    const { can, isAdmin } = checker(meAnswered(staffMe({ permissions: ['leads.view_own', 'clients.close'] })))
    expect(can('leads.view_own')).toBe(true)
    expect(can('clients.close')).toBe(true)
    expect(can('billing.export_statements')).toBe(false)
    expect(isAdmin).toBe(false)
  })

  // The bug this replaced: employee number 101 was not in the first page of the employee list, so
  // the console could not find their row and every key answered false.
  it('gives an employee beyond the first 100 their access without reading the employee list', () => {
    const { can, isLoading, isError } = checker(
      meAnswered(staffMe({ employee_id: 'employee-137', permissions: ['leads.view_own', 'clients.view_own'] })),
    )
    expect(can('leads.view_own')).toBe(true)
    expect(can('clients.view_own')).toBe(true)
    expect(isLoading).toBe(false)
    expect(isError).toBe(false)
    expect(useEmployees).not.toHaveBeenCalled()
    expect(useDesignations).not.toHaveBeenCalled()
  })

  it('reports the Owner/Admin from staff.is_admin, who holds every key the server lists', () => {
    const { can, isAdmin } = checker(meAnswered(staffMe({ is_admin: true, permissions: ALL_KEYS })))
    expect(isAdmin).toBe(true)
    expect(ALL_KEYS.every((key) => can(key))).toBe(true)
  })

  it('does not treat the consultancy_admin role as the Owner/Admin when the server says otherwise', () => {
    const { isAdmin, can } = checker(
      meAnswered(staffMe({ is_admin: false, permissions: ['leads.view_own'] }, { role: 'consultancy_admin' })),
    )
    expect(isAdmin).toBe(false)
    expect(can('staff.manage_employees')).toBe(false)
  })

  it('fails closed for someone who is not staff: a platform account, a freelancer, a student', () => {
    for (const me of [platformMe({ finance: true }), plainMe('freelancer'), plainMe('student')]) {
      const { can, isAdmin, isError } = checker(meAnswered(me))
      expect(can('leads.view_own')).toBe(false)
      expect(isAdmin).toBe(false)
      expect(isError).toBe(false)
    }
  })

  it('keeps the admin of a lapsed consultancy their permissions (the server still lists them)', () => {
    const { can, isAdmin } = checker(meAnswered(staffMe({ is_admin: true, lapsed: true, permissions: ALL_KEYS })))
    expect(isAdmin).toBe(true)
    expect(can('settings.edit_profile')).toBe(true)
  })

  it('reports loading while the answer is on its way, and answers no key yet', () => {
    const { can, isLoading, isError } = checker(meLoading())
    expect(isLoading).toBe(true)
    expect(isError).toBe(false)
    expect(can('leads.view_own')).toBe(false)
  })

  it('is neither loading nor an error when nobody is signed in', () => {
    const { isLoading, isError, can } = checker(meSignedOut())
    expect(isLoading).toBe(false)
    expect(isError).toBe(false)
    expect(can('leads.view_own')).toBe(false)
  })

  it('reports an error only when a failure left nothing to answer from', () => {
    // A failed background refresh keeps the previous answer: still answerable, so not an error.
    const kept = checker(meFailed(new TypeError('Failed to fetch'), staffMe({ permissions: ['clients.close'] })))
    expect(kept.isError).toBe(false)
    expect(kept.can('clients.close')).toBe(true)
    // A failure with no answer at all is the real thing.
    const nothing = checker(meFailed())
    expect(nothing.isError).toBe(true)
    expect(nothing.can('clients.close')).toBe(false)
  })

  it('reports an error, not a denial, when /me refused a non-admin of a lapsed consultancy', () => {
    const { isError, can } = checker(meRefused('subscription_lapsed', 'Your consultancy\u2019s subscription has lapsed.'))
    expect(isError).toBe(true)
    expect(can('leads.view_own')).toBe(false)
  })

  it('refetch asks /me again', () => {
    const refetch = vi.fn()
    checker(meFailed(new TypeError('Failed to fetch'), undefined, refetch)).refetch()
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})

describe('usePermission', () => {
  it('is one key of the same answer', () => {
    mockedMe.mockReturnValue(meAnswered(staffMe({ permissions: ['billing.record_payment'] })))
    expect(renderHook(() => usePermission('billing.record_payment')).result.current).toBe(true)
    expect(renderHook(() => usePermission('billing.export_statements')).result.current).toBe(false)
  })
})

describe('useAvailablePermissions', () => {
  it("is the plan's list from /me, and undefined until it has answered", () => {
    mockedMe.mockReturnValue(meAnswered(staffMe({ available_permissions: ['leads.view_own', 'clients.view_own'] })))
    expect(renderHook(() => useAvailablePermissions()).result.current).toEqual(['leads.view_own', 'clients.view_own'])
    mockedMe.mockReturnValue(meLoading())
    expect(renderHook(() => useAvailablePermissions()).result.current).toBeUndefined()
  })
})

// Permissions a plan gives no meaning to are hidden from both editors (product owner, 2026-09-25):
// the checklist is exactly `Consultancy.available_permissions`, in the server's order.
describe('visiblePermissionGroups', () => {
  it('shows only the served keys, in the served order, under their usual headings', () => {
    const groups = visiblePermissionGroups(['leads.view_own', 'clients.view_all', 'leads.view_all', 'billing.view_commission_details'])
    expect(groups.map((g) => g.label)).toEqual(['Leads', 'Clients & Plans', 'Billing'])
    expect(permissionKeys(groups)).toEqual(['leads.view_own', 'leads.view_all', 'clients.view_all', 'billing.view_commission_details'])
    expect(groups[0].permissions[0]).toEqual({ key: 'leads.view_own', label: 'View own leads' })
  })

  it('hides a stored key the plan leaves out, even when it is ticked', () => {
    const groups = visiblePermissionGroups(['leads.view_own'], { 'staff.manage_designations': true, 'leads.view_own': true })
    expect(permissionKeys(groups)).toEqual(['leads.view_own'])
  })

  it('labels a served key this build has never heard of rather than dropping it (M34)', () => {
    const groups = visiblePermissionGroups(['leads.view_own', 'reports.export_all'])
    expect(groups.at(-1)).toEqual({
      key: '__unknown',
      label: 'Other permissions on this account',
      permissions: [{ key: 'reports.export_all', label: expect.any(String) }],
    })
  })

  it('falls back to the full registry for a record without the field', () => {
    expect(visiblePermissionGroups(undefined, { 'leads.view_own': true })).toEqual(permissionGroupsFor({ 'leads.view_own': true }))
  })
})

describe('pickPermissions', () => {
  it('narrows a sparse map to the visible keys without inventing entries', () => {
    expect(pickPermissions({ 'leads.view_all': false, 'staff.manage_designations': true }, ['leads.view_own', 'leads.view_all'])).toEqual({
      'leads.view_all': false,
    })
    expect(pickPermissions(undefined, ['leads.view_own'])).toEqual({})
  })
})

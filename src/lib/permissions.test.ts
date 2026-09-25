import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// `usePermissionChecker` mirrors the mock server's `effectivePermission()`: admin bypass, then the
// employee's own override, then the designation baseline, failing closed on anything unknown. It
// also has to tell "still loading" and "the lookup failed" apart from "genuinely no" — a
// regression there flashes a denial at people who have the permission (the bug PermissionGate
// exists to prevent).
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (s: { user: { id: string } | null }) => unknown) => selector({ user: { id: 'u1' } })),
}))
vi.mock('@/queries/staff', () => ({ useEmployees: vi.fn(), useDesignations: vi.fn() }))

import { useEmployees, useDesignations } from '@/queries/staff'
import {
  permissionGroupsFor,
  permissionKeys,
  pickPermissions,
  usePermissionChecker,
  visiblePermissionGroups,
} from './permissions'

type QueryLike<T> = { data: T | undefined; isLoading: boolean; isError: boolean; refetch: () => void }
function query<T>(data: T | undefined, extra: Partial<QueryLike<T>> = {}): QueryLike<T> {
  return { data, isLoading: false, isError: false, refetch: vi.fn(), ...extra }
}

const mockedEmployees = vi.mocked(useEmployees)
const mockedDesignations = vi.mocked(useDesignations)

function employee(overrides: Record<string, unknown> = {}) {
  return { id: 'e1', user: { id: 'u1' }, is_consultancy_admin: false, designation_id: 'd1', permission_overrides: {}, ...overrides }
}
const designation = { id: 'd1', permissions: { 'leads.close': true, 'clients.close': false } }

function setup(emp: ReturnType<typeof employee> | null, opts: { employees?: Partial<QueryLike<unknown>>; designations?: Partial<QueryLike<unknown>> } = {}) {
  mockedEmployees.mockReturnValue(query({ items: emp ? [emp] : [] }, opts.employees) as never)
  mockedDesignations.mockReturnValue(query([designation], opts.designations) as never)
  return renderHook(() => usePermissionChecker()).result.current
}

describe('usePermissionChecker', () => {
  it('falls back to the designation baseline when the employee has no override', () => {
    const { can } = setup(employee())
    expect(can('leads.close')).toBe(true)
    expect(can('clients.close')).toBe(false)
    expect(can('billing.export_statements')).toBe(false)
  })

  it('lets an explicit override win in both directions', () => {
    const { can } = setup(employee({ permission_overrides: { 'leads.close': false, 'clients.close': true } }))
    expect(can('leads.close')).toBe(false)
    expect(can('clients.close')).toBe(true)
  })

  it('grants everything to a consultancy admin regardless of designation', () => {
    const { can } = setup(employee({ is_consultancy_admin: true, designation_id: 'missing' }))
    expect(can('clients.close')).toBe(true)
    expect(can('anything.at.all')).toBe(true)
  })

  it('fails closed when the signed-in user has no employee row', () => {
    const { can } = setup(null)
    expect(can('leads.close')).toBe(false)
  })

  it('reports loading while either query is in flight', () => {
    expect(setup(employee(), { employees: { isLoading: true } }).isLoading).toBe(true)
    expect(setup(employee(), { designations: { isLoading: true } }).isLoading).toBe(true)
    expect(setup(employee()).isLoading).toBe(false)
  })

  it('reports an error only when a failure left nothing to answer from', () => {
    // A failed background refetch keeps the previous data: still answerable, so not an error.
    expect(setup(employee(), { employees: { isError: true } }).isError).toBe(false)
    // A failure with no data at all is the real thing.
    mockedEmployees.mockReturnValue(query(undefined, { isError: true }) as never)
    mockedDesignations.mockReturnValue(query([designation]) as never)
    expect(renderHook(() => usePermissionChecker()).result.current.isError).toBe(true)
  })

  it('refetch retries both sources', () => {
    const employeesRefetch = vi.fn()
    const designationsRefetch = vi.fn()
    const { refetch } = setup(employee(), {
      employees: { refetch: employeesRefetch },
      designations: { refetch: designationsRefetch },
    })
    refetch()
    expect(employeesRefetch).toHaveBeenCalledTimes(1)
    expect(designationsRefetch).toHaveBeenCalledTimes(1)
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

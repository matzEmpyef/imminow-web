import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The Employees page intro says where a person's access comes from, and the owner reads
// "Full access (owner)" on every plan, with or without designations.
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/queries/staff', () => ({
  useAllEmployees: vi.fn(),
  useActiveEmployeeCount: vi.fn(),
  useDesignations: vi.fn(),
  useBranches: vi.fn(),
  useDisableEmployee: vi.fn(),
  useUpdateEmployee: vi.fn(),
  useInviteEmployee: vi.fn(),
  useReactivateEmployee: vi.fn(),
}))
vi.mock('@/queries/consultancy', () => ({ useMyConsultancy: vi.fn() }))
const flags = vi.hoisted(() => ({ designations: false, institute: false }))
vi.mock('@/lib/features', () => ({ useFeature: (key: string) => key === 'designations' && flags.designations }))
vi.mock('@/lib/me', () => ({ useMeStaff: () => ({ employee_id: 'e-me' }) }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/lib/accountWords', () => ({
  useAccountWords: () => ({ person: 'consultant', org: 'consultancy', isInstitute: flags.institute }),
}))

import {
  useActiveEmployeeCount,
  useAllEmployees,
  useBranches,
  useDesignations,
  useDisableEmployee,
  useInviteEmployee,
  useReactivateEmployee,
  useUpdateEmployee,
} from '@/queries/staff'
import { useMyConsultancy } from '@/queries/consultancy'
import { EmployeesPage } from './EmployeesPage'

const owner = {
  id: 'e-me',
  detail: 'full',
  active: true,
  status: 'active',
  is_consultancy_admin: true,
  branch_ids: [],
  assigned_work_count: 0,
  user: { first_name: 'Mira', last_name: 'Test', email: 'mira@example.test', designation: 'Owner/Admin' },
}

beforeEach(() => {
  flags.designations = false
  flags.institute = false
  vi.mocked(useAllEmployees).mockReturnValue({ data: { items: [owner] }, isLoading: false, isError: false } as never)
  vi.mocked(useActiveEmployeeCount).mockReturnValue({ data: 1 } as never)
  vi.mocked(useDesignations).mockReturnValue({ data: [] } as never)
  vi.mocked(useBranches).mockReturnValue({ data: [{ id: 'b1', name: 'Head Office' }] } as never)
  for (const hook of [useUpdateEmployee, useDisableEmployee, useInviteEmployee, useReactivateEmployee]) {
    vi.mocked(hook).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
  }
  vi.mocked(useMyConsultancy).mockReturnValue({ data: { seat_limit: 4 } } as never)
})

describe('Employees page intro and owner label', () => {
  it('with designations: access comes from the designation and can be changed per person', () => {
    flags.designations = true
    render(<EmployeesPage />)
    expect(
      screen.getByText('Each person’s access comes from their designation. You can also change an individual person’s access.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/baseline|overrides/)).not.toBeInTheDocument()
    expect(within(screen.getByText('Mira Test').closest('tr')!).getByText('Full access (owner)')).toBeInTheDocument()
  })

  it('without designations: everyone has the same access, and commission details are the administrator’s', () => {
    render(<EmployeesPage />)
    expect(
      screen.getByText('Everyone on this plan has the same access. Commission details are visible only to the administrator.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/identical/)).not.toBeInTheDocument()
    // The owner reads the same on this plan as on the others.
    expect(within(screen.getByText('Mira Test').closest('tr')!).getByText('Full access (owner)')).toBeInTheDocument()
  })

  it('a college’s account says only that everyone has the same access', () => {
    flags.institute = true
    render(<EmployeesPage />)
    expect(screen.getByText('Everyone on this plan has the same access.')).toBeInTheDocument()
    expect(screen.queryByText(/Commission details/)).not.toBeInTheDocument()
    expect(within(screen.getByText('Mira Test').closest('tr')!).getByText('Full access (owner)')).toBeInTheDocument()
  })
})

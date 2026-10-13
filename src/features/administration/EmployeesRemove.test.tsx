import type { ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// T1-13: on EVERY plan the admin can disable an employee and withdraw an invitation. This is a
// Starter account: no Designations, one branch, so there is no Manage Access on any row. An invited
// person reads "Invited", not "Active", and the invitation's action is "Withdraw invitation".
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/queries/staff', () => ({
  useAllEmployees: vi.fn(),
  useActiveEmployeeCount: vi.fn(),
  useDesignations: vi.fn(),
  useBranches: vi.fn(),
  useDisableEmployee: vi.fn(),
  useUpdateEmployee: vi.fn(),
  useInviteEmployee: vi.fn(),
}))
vi.mock('@/queries/consultancy', () => ({ useMyConsultancy: vi.fn() }))
vi.mock('@/lib/features', () => ({ useFeature: vi.fn(() => false) }))
vi.mock('@/lib/me', () => ({ useMeStaff: () => ({ employee_id: 'e-me' }) }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: () => ({ person: 'consultant', org: 'consultancy' }) }))

import {
  useActiveEmployeeCount,
  useAllEmployees,
  useBranches,
  useDesignations,
  useDisableEmployee,
  useUpdateEmployee,
} from '@/queries/staff'
import { useMyConsultancy } from '@/queries/consultancy'
import { EmployeesPage } from './EmployeesPage'

function person(id: string, first: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    detail: 'full',
    active: true,
    branch_ids: [],
    assigned_work_count: 0,
    user: {
      first_name: first,
      last_name: 'Test',
      email: `${first.toLowerCase()}@example.test`,
      last_login_at: '2026-10-01T09:00:00Z',
    },
    ...extra,
  }
}

const ROWS = [
  person('e-owner', 'Olive', { is_consultancy_admin: true }),
  person('e-me', 'Mira'),
  person('e-colleague', 'Colin'),
  person('e-invited', 'Ines', {
    user: { first_name: 'Ines', last_name: 'Test', email: 'ines@example.test', last_login_at: null },
  }),
  person('e-off', 'Omar', { active: false }),
]

const disable = vi.fn()

beforeEach(() => {
  disable.mockReset()
  vi.mocked(useAllEmployees).mockReturnValue({ data: { items: ROWS }, isLoading: false, isError: false } as never)
  vi.mocked(useActiveEmployeeCount).mockReturnValue({ data: 4 } as never)
  vi.mocked(useDesignations).mockReturnValue({ data: [] } as never)
  vi.mocked(useBranches).mockReturnValue({ data: [{ id: 'b1', name: 'Head Office' }] } as never)
  vi.mocked(useUpdateEmployee).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
  vi.mocked(useDisableEmployee).mockReturnValue({ mutate: disable, isPending: false, isError: false } as never)
  vi.mocked(useMyConsultancy).mockReturnValue({ data: { seat_limit: 4 } } as never)
})

function rowOf(name: string) {
  return screen.getByText(new RegExp(`^${name} Test`)).closest('tr')!
}

describe('Employees on a plan without Manage Access', () => {
  it('offers Disable on a colleague, but not on the owner, the person signed in, or someone already off', () => {
    render(<EmployeesPage />)
    expect(within(rowOf('Colin')).getByRole('button', { name: 'Disable Colin Test' })).toBeInTheDocument()
    expect(within(rowOf('Olive')).queryByRole('button', { name: /Disable|Withdraw/ })).not.toBeInTheDocument()
    expect(within(rowOf('Mira')).queryByRole('button', { name: /Disable|Withdraw/ })).not.toBeInTheDocument()
    expect(within(rowOf('Omar')).queryByRole('button', { name: /Disable|Withdraw/ })).not.toBeInTheDocument()
    // There is no Manage Access on this plan.
    expect(screen.queryByRole('button', { name: /Manage access/i })).not.toBeInTheDocument()
  })

  it('shows Invited for a person who has not joined, and Withdraw invitation as the action', () => {
    render(<EmployeesPage />)
    const row = rowOf('Ines')
    expect(within(row).getByText('Invited')).toBeInTheDocument()
    expect(within(row).queryByText('Active')).not.toBeInTheDocument()
    expect(within(rowOf('Colin')).getByText('Active')).toBeInTheDocument()
    expect(within(rowOf('Omar')).getByText('Disabled')).toBeInTheDocument()

    fireEvent.click(within(row).getByRole('button', { name: 'Withdraw invitation for Ines Test' }))
    const dialog = screen.getByRole('dialog', { name: 'Withdraw Invitation' })
    expect(within(dialog).getByText(/the seat is free again straight away/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/Disable/)).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Withdraw invitation' }))
    expect(disable.mock.calls[0][0]).toEqual({ id: 'e-invited', reassign_to_employee_id: undefined })
  })

  it('disables a working colleague after a confirmation', () => {
    render(<EmployeesPage />)
    fireEvent.click(within(rowOf('Colin')).getByRole('button', { name: 'Disable Colin Test' }))
    const dialog = screen.getByRole('dialog', { name: 'Disable Employee' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable' }))
    expect(disable.mock.calls[0][0]).toEqual({ id: 'e-colleague', reassign_to_employee_id: undefined })
  })

  it('does not send the editor to a Manage Access that this plan does not have', () => {
    render(<EmployeesPage />)
    fireEvent.click(within(rowOf('Colin')).getByRole('button', { name: 'Edit Colin Test' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Colin Test' })
    expect(within(dialog).queryByText(/Manage Access/)).not.toBeInTheDocument()
    expect(within(dialog).getByText(/Everyone on this plan has full access/)).toBeInTheDocument()
  })

  it('tells a full list how to free a seat', () => {
    render(<EmployeesPage />)
    expect(screen.getByText(/Disable someone or withdraw an invitation below to free a seat/)).toBeInTheDocument()
  })
})

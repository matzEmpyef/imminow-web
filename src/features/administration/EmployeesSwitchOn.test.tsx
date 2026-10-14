import type { ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 8 T2-03 and fault check 9e: an invitation left for 7 days reads "Invitation expired" and is
// offered the normal invitation, not a switch-back-on. A disabled person is switched back on after
// a confirm, and a refusal shows the server's own sentence.
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
  useInviteEmployee,
  useReactivateEmployee,
  useUpdateEmployee,
} from '@/queries/staff'
import { useMyConsultancy } from '@/queries/consultancy'
import { EmployeesPage } from './EmployeesPage'

function person(id: string, first: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    detail: 'full',
    active: true,
    status: 'active',
    branch_ids: [],
    assigned_work_count: 0,
    user: { first_name: first, last_name: 'Test', email: `${first.toLowerCase()}@example.test` },
    ...extra,
  }
}

const ROWS = [
  person('e-me', 'Mira'),
  person('e-expired', 'Ines', { active: false, status: 'invitation_expired' }),
  person('e-off', 'Omar', { active: false, status: 'deactivated' }),
]

const reactivate = vi.fn()
let reactivateState: Record<string, unknown> = {}

beforeEach(() => {
  reactivate.mockReset()
  reactivateState = { mutate: reactivate, isPending: false, isError: false }
  vi.mocked(useAllEmployees).mockReturnValue({ data: { items: ROWS }, isLoading: false, isError: false } as never)
  vi.mocked(useActiveEmployeeCount).mockReturnValue({ data: 1 } as never)
  vi.mocked(useDesignations).mockReturnValue({ data: [] } as never)
  vi.mocked(useBranches).mockReturnValue({ data: [{ id: 'b1', name: 'Head Office' }] } as never)
  vi.mocked(useUpdateEmployee).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
  vi.mocked(useDisableEmployee).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
  vi.mocked(useInviteEmployee).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
  vi.mocked(useReactivateEmployee).mockImplementation(() => reactivateState as never)
  vi.mocked(useMyConsultancy).mockReturnValue({ data: { seat_limit: 4 } } as never)
})

function rowOf(name: string) {
  return screen.getByText(new RegExp(`^${name} Test`)).closest('tr')!
}

describe('Employees: switching someone back on', () => {
  it('reads an unanswered invitation as "Invitation expired" and offers a new invitation, not a switch-on', () => {
    render(<EmployeesPage />)
    const row = rowOf('Ines')
    expect(within(row).getByText('Invitation expired')).toBeInTheDocument()
    expect(within(row).getByText('An expired invitation cannot be switched back on. Send a new invitation instead.')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /Switch .* back on/ })).not.toBeInTheDocument()

    fireEvent.click(within(row).getByRole('button', { name: 'Invite again' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('offers Switch back on to a disabled person, asks first, and then sends the call', () => {
    render(<EmployeesPage />)
    fireEvent.click(within(rowOf('Omar')).getByRole('button', { name: 'Switch Omar Test back on' }))
    expect(reactivate).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Switch Back On' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch back on' }))
    expect(reactivate.mock.calls[0][0]).toBe('e-off')
  })

  it('shows the sentence the server refused with', () => {
    reactivateState = {
      mutate: reactivate,
      isPending: false,
      isError: true,
      error: new Error(
        'Your team already uses all 5 of its seats, so nobody can be switched back on. Disable someone else first, or ask immiNow for more seats.',
      ),
    }
    render(<EmployeesPage />)
    fireEvent.click(within(rowOf('Omar')).getByRole('button', { name: 'Switch Omar Test back on' }))
    expect(screen.getByText(/Your team already uses all 5 of its seats/)).toBeInTheDocument()
  })

  it('offers neither to an active colleague', () => {
    render(<EmployeesPage />)
    expect(within(rowOf('Mira')).queryByRole('button', { name: /back on/ })).not.toBeInTheDocument()
  })
})

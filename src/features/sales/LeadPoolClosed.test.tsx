import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// T1-11 (phase 8): a lead closed from the Lead Pool is still unassigned, so the pool is the only
// list it can appear in. "Include closed" brings it back, with its reason and (where the server
// allows it) Reopen, and says which list Reopen returns it to.
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/queries/leads', () => ({
  useLeads: vi.fn(),
  useAllocateLead: vi.fn(),
  useBulkAllocateLeads: vi.fn(),
  useReopenLead: vi.fn(),
}))
vi.mock('@/queries/staff', () => ({ useBranches: vi.fn() }))
vi.mock('@/lib/features', () => ({ useFeature: vi.fn(() => false) }))
vi.mock('@/lib/permissions', () => ({ usePermissionChecker: vi.fn(() => ({ can: () => true })) }))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: vi.fn(() => ({ person: 'consultant', org: 'consultancy' })) }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('./ImportLeadsModal', () => ({ AddLeadModal: () => null, ImportLeadsModal: () => null }))
vi.mock('./CloseLeadModal', () => ({ CloseLeadModal: () => null }))
vi.mock('@/features/clients/LeadDetailModal', () => ({ LeadDetailModal: () => null }))
vi.mock('@/features/sales/AssignConsultantMenu', () => ({
  AssignConsultantMenu: ({ label }: { label: string }) => <button type="button">{label}</button>,
}))

import { useAllocateLead, useBulkAllocateLeads, useLeads, useReopenLead } from '@/queries/leads'
import { useBranches } from '@/queries/staff'
import { LeadPoolPage } from './LeadPoolPage'

const OPEN = {
  id: 'lead-1',
  origin: 'sentpo' as const,
  name: 'Ananya Iyer',
  status: 'active' as const,
  created_at: '2026-09-18T09:00:00Z',
}
const CLOSED = {
  id: 'lead-2',
  origin: 'imported' as const,
  name: 'Meera Walkin',
  status: 'closed' as const,
  created_at: '2026-09-19T09:00:00Z',
  closed_reason_label: 'Lost contact',
  can_reopen: true,
  closed_by: 'consultancy',
  assigned_employee_id: null,
}

function query<T>(data: T) {
  return { data, isLoading: false, isError: false } as never
}

beforeEach(() => {
  vi.mocked(useBranches).mockReturnValue(query([]))
  vi.mocked(useAllocateLead).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  vi.mocked(useBulkAllocateLeads).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  vi.mocked(useReopenLead).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
  vi.mocked(useLeads).mockImplementation(((filters: { showClosed?: boolean }) =>
    query({ items: filters.showClosed ? [OPEN, CLOSED] : [OPEN], meta: { total: 1 } })) as never)
})

describe('Lead Pool: Include closed', () => {
  it('asks for open leads only until the switch is turned on', () => {
    render(<LeadPoolPage />)
    expect(vi.mocked(useLeads).mock.calls.at(-1)?.[0]).toMatchObject({ unallocated: true, showClosed: false })
    expect(screen.queryByText('Meera Walkin')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Include closed'))
    expect(vi.mocked(useLeads).mock.calls.at(-1)?.[0]).toMatchObject({ unallocated: true, showClosed: true })
    expect(screen.getByText('Meera Walkin')).toBeInTheDocument()
  })

  it('shows the closed lead with its reason, Reopen, and no Allocate or Close', () => {
    render(<LeadPoolPage />)
    fireEvent.click(screen.getByLabelText('Include closed'))

    const closedRow = screen.getByText('Meera Walkin').closest('tr')!
    expect(within(closedRow).getByText('Closed')).toBeInTheDocument()
    expect(within(closedRow).getByText('Lost contact')).toBeInTheDocument()
    expect(within(closedRow).getByRole('button', { name: 'Reopen Meera Walkin' })).toBeInTheDocument()
    expect(within(closedRow).queryByRole('button', { name: /Allocate/ })).not.toBeInTheDocument()
    expect(within(closedRow).queryByRole('button', { name: /^Close / })).not.toBeInTheDocument()
    expect(within(closedRow).getByRole('checkbox')).toBeDisabled()

    const openRow = screen.getByText('Ananya Iyer').closest('tr')!
    expect(within(openRow).getByRole('button', { name: 'Allocate Ananya Iyer' })).toBeInTheDocument()
    expect(within(openRow).queryByRole('button', { name: /Reopen/ })).not.toBeInTheDocument()
  })

  it('does not offer Reopen when the server says the lead cannot be reopened', () => {
    vi.mocked(useLeads).mockReturnValue(
      query({ items: [{ ...CLOSED, can_reopen: false, closed_by: 'student' }], meta: { total: 1 } }),
    )
    render(<LeadPoolPage />)
    fireEvent.click(screen.getByLabelText('Include closed'))
    expect(screen.queryByRole('button', { name: 'Reopen Meera Walkin' })).not.toBeInTheDocument()
  })

  it('names the Lead Pool in the Reopen box for an unassigned lead', () => {
    render(<LeadPoolPage />)
    fireEvent.click(screen.getByLabelText('Include closed'))
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Meera Walkin' }))
    expect(screen.getByText(/will go back to the Lead Pool/)).toBeInTheDocument()
  })

  it('tells a searcher that a closed lead is behind the switch', async () => {
    vi.useFakeTimers()
    vi.mocked(useLeads).mockReturnValue(query({ items: [], meta: { total: 0 } }))
    render(<LeadPoolPage />)
    fireEvent.change(screen.getByPlaceholderText('Search leads…'), { target: { value: 'meera' } })
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByText(/switch on “Include closed”/)).toBeInTheDocument()
    vi.useRealTimers()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// T1-12: the Whole Consultancy "Unattended Leads" card counts students still in the Lead Pool, so
// it opens Active Leads with the pool added. Without that link the page lists leads a consultant
// holds, as it always has.
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/queries/leads', () => ({ useLeads: vi.fn(), useAllocateLead: vi.fn(), useSetLeadTags: vi.fn() }))
vi.mock('@/queries/tags', () => ({ useTags: vi.fn(), useCreateTag: vi.fn() }))
vi.mock('@/queries/staff', () => ({ useBranches: vi.fn() }))
vi.mock('@/lib/me', () => ({ useMeStaff: () => ({ is_admin: true, branch_ids: [] }) }))
vi.mock('@/lib/permissions', () => ({ usePermission: () => true }))
vi.mock('@/lib/listCeilings', () => ({ useListCeiling: () => undefined }))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: () => ({ org: 'consultancy', person: 'consultant' }) }))
vi.mock('@/lib/features', () => ({ useFeature: () => true }))
vi.mock('@/features/sales/AssignConsultantMenu', () => ({
  AssignConsultantMenu: ({ label }: { label: string }) => <button type="button">{label}</button>,
}))

import { useAllocateLead, useLeads, useSetLeadTags } from '@/queries/leads'
import { useCreateTag, useTags } from '@/queries/tags'
import { useBranches } from '@/queries/staff'
import { ActiveLeadsPage } from './ActiveLeadsPage'

const POOL_LEAD = {
  id: 'p1',
  origin: 'sentpo' as const,
  name: 'Sana Gupta',
  status: 'active' as const,
  unattended: true,
  assigned_employee_id: null,
  assigned_employee_name: null,
}

function show(address: string) {
  return render(
    <MemoryRouter initialEntries={[address]}>
      <ActiveLeadsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(useLeads).mockReturnValue({ data: { items: [POOL_LEAD], meta: { total: 1 } }, isLoading: false, isError: false } as never)
  vi.mocked(useAllocateLead).mockReturnValue({ mutate: vi.fn() } as never)
  vi.mocked(useSetLeadTags).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  vi.mocked(useTags).mockReturnValue({ data: [] } as never)
  vi.mocked(useCreateTag).mockReturnValue({ mutateAsync: vi.fn() } as never)
  vi.mocked(useBranches).mockReturnValue({ data: [] } as never)
})

describe('Active Leads from the Unattended Leads card', () => {
  it('asks for pool leads too when the link says so', () => {
    show('/sales/active-leads?unattended=true&with_pool=true')
    const filters = vi.mocked(useLeads).mock.calls.at(-1)?.[0]
    expect(filters).toMatchObject({ unattended: true })
    expect(filters?.unallocated).toBeUndefined()
    expect(screen.getByLabelText('Include Lead Pool')).toBeChecked()
    expect(screen.getByText('Sana Gupta')).toBeInTheDocument()
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
    // A pool lead is allocated, not reassigned.
    expect(screen.getByRole('button', { name: 'Allocate Sana Gupta' })).toBeInTheDocument()
  })

  it('lists only leads a consultant holds otherwise, and the pool can be switched in', () => {
    show('/sales/active-leads')
    expect(vi.mocked(useLeads).mock.calls.at(-1)?.[0]).toMatchObject({ unallocated: false })
    expect(screen.getByLabelText('Include Lead Pool')).not.toBeChecked()

    fireEvent.click(screen.getByLabelText('Include Lead Pool'))
    expect(vi.mocked(useLeads).mock.calls.at(-1)?.[0]?.unallocated).toBeUndefined()
  })
})

// T4-12: a lead that became a client is badged "Converted" from the served client, and offers no
// reassign or allocate control.
describe('Active Leads: a converted lead', () => {
  it('shows the Converted badge from converted_client_id and no reassign control', () => {
    const converted = {
      ...POOL_LEAD,
      id: 'c1',
      name: 'Asha Nair',
      status: 'active' as const,
      assigned_employee_id: 'e1',
      assigned_employee_name: 'Nadia',
      converted_client_id: 'k1',
    }
    vi.mocked(useLeads).mockReturnValue({ data: { items: [converted], meta: { total: 1 } }, isLoading: false, isError: false } as never)
    show('/sales/active-leads')
    expect(screen.getByText('Converted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reassign Asha Nair/ })).not.toBeInTheDocument()
  })

  it('still badges a lead whose status says converted, with no served client', () => {
    const converted = { ...POOL_LEAD, id: 'c2', name: 'Ravi Kumar', status: 'converted' as const, assigned_employee_id: 'e1' }
    vi.mocked(useLeads).mockReturnValue({ data: { items: [converted], meta: { total: 1 } }, isLoading: false, isError: false } as never)
    show('/sales/active-leads')
    expect(screen.getByText('Converted')).toBeInTheDocument()
  })
})

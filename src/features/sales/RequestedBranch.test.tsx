import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// WHICH BRANCH THE STUDENT ASKED TO TALK TO (product owner, 2026-09-21) — `preferred_branch_name`
// on a lead, surfaced on Lead Pool and Active Leads so the consultant allocating can honour it.
//
// The thing under test is not really "a column renders". It is that the column can never be read
// as routing: a lead carrying a requested branch is allocated exactly like one without, nothing on
// the server reads the field, and the SERVICING branch (`branch_id`) is still stamped from whoever
// the lead is assigned to. So what is pinned is the wording that says so, the fact that the column
// only appears where a second branch exists to have been asked for, and that it reads
// `preferred_branch_name` rather than the servicing branch.
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/queries/leads', () => ({
  useLeads: vi.fn(),
  useAllocateLead: vi.fn(),
  useBulkAllocateLeads: vi.fn(),
}))
vi.mock('@/queries/staff', () => ({ useEmployees: vi.fn(), useBranches: vi.fn() }))
vi.mock('@/lib/features', () => ({ useFeature: vi.fn(() => false) }))
vi.mock('@/lib/permissions', () => ({ usePermissionChecker: vi.fn(() => ({ can: () => true })) }))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: vi.fn(() => ({ person: 'consultant', org: 'consultancy' })) }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('./ImportLeadsModal', () => ({ AddLeadModal: () => null, ImportLeadsModal: () => null }))
vi.mock('./CloseLeadModal', () => ({ CloseLeadModal: () => null }))
vi.mock('@/features/clients/LeadDetailModal', () => ({ LeadDetailModal: () => null }))

import { useAllocateLead, useBulkAllocateLeads, useLeads } from '@/queries/leads'
import { useBranches, useEmployees } from '@/queries/staff'
import { LeadPoolPage } from './LeadPoolPage'

const MUMBAI = { id: 'branch-mumbai', name: 'Head Office — Mumbai', address: '14th Floor', active: true }
const DELHI = { id: 'branch-delhi', name: 'North Campus — Delhi', address: 'B-42', active: true }

const LEADS = [
  {
    id: 'lead-1',
    origin: 'sentpo' as const,
    name: 'Ananya Iyer',
    status: 'active' as const,
    created_at: '2026-09-18T09:00:00Z',
    // Asked for Delhi. Nothing has been allocated yet, so there is no servicing branch at all —
    // which is exactly the moment this field is for.
    preferred_branch_id: DELHI.id,
    preferred_branch_name: DELHI.name,
  },
  {
    id: 'lead-2',
    origin: 'imported' as const,
    name: 'Rohit Nair',
    status: 'active' as const,
    created_at: '2026-09-19T09:00:00Z',
    source: 'walk_in',
    // Always null on an imported lead: there is no student account behind that row to have asked.
    preferred_branch_name: null,
  },
]

function query<T>(data: T, overrides: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, ...overrides } as never
}

function renderPool(branches: typeof MUMBAI[]) {
  vi.mocked(useBranches).mockReturnValue(query(branches))
  return render(<LeadPoolPage />)
}

beforeEach(() => {
  vi.mocked(useLeads).mockReturnValue(query({ items: LEADS, meta: { total: LEADS.length } }))
  vi.mocked(useEmployees).mockReturnValue(query({ items: [], meta: { total: 0 } }))
  vi.mocked(useAllocateLead).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  vi.mocked(useBulkAllocateLeads).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
})

describe('Lead Pool shows the branch the student asked for', () => {
  it('names it on the row, and says in words that nothing is routed from it', () => {
    renderPool([MUMBAI, DELHI])

    const row = screen.getByText('Ananya Iyer').closest('tr')!
    expect(within(row).getByText('North Campus — Delhi')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Requested branch' })).toBeInTheDocument()
    // The sentence is the load-bearing part: "Requested branch: North Campus — Delhi" with no
    // words around it reads as an assignment the platform made.
    expect(screen.getByText(/Nothing is routed from it/)).toBeInTheDocument()
  })

  it('leaves an imported lead blank rather than inventing a branch for it', () => {
    renderPool([MUMBAI, DELHI])
    const row = screen.getByText('Rohit Nair').closest('tr')!
    expect(within(row).queryByText(/Campus|Head Office/)).not.toBeInTheDocument()
  })

  it('drops the column on a single-branch consultancy, where every answer would be the same', () => {
    renderPool([MUMBAI])
    expect(screen.queryByRole('columnheader', { name: 'Requested branch' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Nothing is routed from it/)).not.toBeInTheDocument()
  })
})

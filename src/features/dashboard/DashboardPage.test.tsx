import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-269: the server serves the Unallocated Leads card only to someone who can allocate
// from the pool, and the branch breakdown only at the whole-account scope. The page shows what it
// is sent: a missing card leaves no gap, and a null breakdown leaves no empty card.
vi.mock('@/features/auth/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/queries/dashboard', () => ({ useDashboard: vi.fn() }))
vi.mock('@/lib/me', () => ({ useMeUser: () => ({ first_name: 'Asha' }) }))
vi.mock('@/lib/permissions', () => ({ usePermission: vi.fn() }))
vi.mock('@/lib/accountWords', () => ({
  useAccountWords: () => ({ org: 'consultancy', wholeLabel: 'Whole Consultancy' }),
}))
vi.mock('@/components/DoughnutChart', () => ({ DoughnutChart: () => <div /> }))
vi.mock('@/components/MonthlyBarChart', () => ({ MonthlyBarChart: () => <div /> }))

import { usePermission } from '@/lib/permissions'
import { useDashboard } from '@/queries/dashboard'
import { DashboardPage } from './DashboardPage'

const cards = [
  { key: 'unallocated_leads', label: 'Unallocated Leads', value: 4 },
  { key: 'active_leads', label: 'Active Leads', value: 9 },
  { key: 'unattended', label: 'Unattended Leads', value: 2 },
  { key: 'clients', label: 'Clients', value: 3 },
]

const base = {
  greeting_name: 'Asha',
  as_of: '2026-10-08T09:00:00Z',
  available_scopes: ['personal'],
  leads_over_time: [],
  conversion_funnel: [],
  applicant_status_breakdown: [],
  applicants_over_time: [],
}

function show(data: Record<string, unknown>) {
  vi.mocked(useDashboard).mockReturnValue({ data: { ...base, ...data }, isLoading: false, isError: false } as never)
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(usePermission).mockReturnValue(true)
})

describe('Consultancy dashboard — what the server leaves out', () => {
  it('shows the pool card and the branch breakdown when both are sent', () => {
    show({
      stat_cards: cards,
      branch_breakdown: [
        { branch_id: 'b1', branch_name: 'Kochi', leads_count: 5 },
        { branch_id: 'b2', branch_name: 'Calicut', leads_count: 4 },
      ],
    })
    expect(screen.getByText('Unallocated Leads')).toBeInTheDocument()
    expect(screen.getByText('Branch Breakdown')).toBeInTheDocument()
    expect(screen.getByText('2 branches: Kochi, Calicut')).toBeInTheDocument()
  })

  it('lays the row out with the cards it was sent when the pool card is missing', () => {
    show({ stat_cards: cards.slice(1), branch_breakdown: null })
    expect(screen.queryByText('Unallocated Leads')).not.toBeInTheDocument()
    // Three cards, three columns: the first one sent takes the lead position, no gap is left.
    const first = screen.getByText('Active Leads')
    expect(first.closest('a')).toHaveAttribute('href', '/sales/active-leads?assigned_to_me=true')
    expect(first.closest('.grid')).toHaveClass('grid-cols-3')
    expect(screen.getByText('Unattended Leads')).toBeInTheDocument()
    expect(screen.getByText('Clients')).toBeInTheDocument()
  })

  it('shows no branch card for a null breakdown, nor for one that is absent', () => {
    show({ stat_cards: cards, branch_breakdown: null })
    expect(screen.queryByText('Branch Breakdown')).not.toBeInTheDocument()
    expect(screen.queryByText(/branches:/)).not.toBeInTheDocument()
  })
})

// T1-12: on Whole Consultancy the cards open the whole account's lists, not "mine".
describe('Consultancy dashboard — where the cards open', () => {
  it('opens the pool-inclusive and unfiltered lists on Whole Consultancy', () => {
    show({
      available_scopes: ['personal', 'consultancy'],
      stat_cards: [...cards, { key: 'pending_allocation', label: 'Pending Consultant Allocation', value: 1 }],
      branch_breakdown: null,
    })
    expect(screen.getByText('Clients').closest('a')).toHaveAttribute('href', '/clients?assigned_to_me=true')

    fireEvent.click(screen.getByRole('button', { name: 'Whole Consultancy' }))
    expect(screen.getByText('Unattended Leads').closest('a')).toHaveAttribute(
      'href',
      '/sales/active-leads?unattended=true&with_pool=true',
    )
    expect(screen.getByText('Active Leads').closest('a')).toHaveAttribute('href', '/sales/active-leads')
    expect(screen.getByText('Clients').closest('a')).toHaveAttribute('href', '/clients')
    expect(screen.getByText('Unallocated Leads').closest('a')).toHaveAttribute('href', '/sales/lead-pool')
    expect(screen.getByText('Pending Consultant Allocation').closest('a')).toHaveAttribute(
      'href',
      '/clients?unassigned=true',
    )
  })
})

// T4-34: a response time in hours reads as days and hours in words.
describe('Usage analytics, response time', () => {
  it('reads 2862 hours as 119 days 6 hours', () => {
    show({
      stat_cards: cards,
      branch_breakdown: null,
      analytics: {
        collecting_since: '2026-01-01',
        response_time_median_hours: 2862,
        oldest_unanswered_lead_days: 12,
        conversion_median_days: null,
        active_student_engagement: [],
      },
    })
    expect(screen.getByText('119 days 6 hours')).toBeInTheDocument()
    expect(screen.queryByText('2862h')).not.toBeInTheDocument()
  })

  it('shows the server’s own wording when it sends one', () => {
    show({
      stat_cards: cards,
      branch_breakdown: null,
      analytics: {
        collecting_since: '2026-01-01',
        response_time_median_hours: 2862,
        response_time_median_text: 'About 119 days (as served)',
        oldest_unanswered_lead_days: 12,
        conversion_median_days: null,
        active_student_engagement: [],
      },
    })
    expect(screen.getByText('About 119 days (as served)')).toBeInTheDocument()
    expect(screen.queryByText('119 days 6 hours')).not.toBeInTheDocument()
  })
})

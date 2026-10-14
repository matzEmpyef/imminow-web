import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

// Phase 8 T4-07 and DECISIONS 126(a), as a consultancy sees Commission Details: "Not yet due" is the
// served `platform_still_to_come`, cases read apart as Active and Closed by `case_closed`, and a
// write-off is never shown — the consultancy is told only that an amount is closed.
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/lib/permissions', () => ({
  usePermissionChecker: () => ({ can: () => true, isAdmin: true, isLoading: false, isError: false, refetch: () => {} }),
}))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: () => ({ isInstitute: false }) }))
vi.mock('@/queries/commission', () => ({ useCommission: vi.fn() }))
vi.mock('./RecordPlatformPaymentModal', () => ({ RecordPlatformPaymentModal: () => null }))

import { useCommission } from '@/queries/commission'
import { CommissionDetailsPage } from './CommissionDetailsPage'

const inr = (amount: number) => ({ amount, currency: 'INR' })

const due = (id: string, name: string, over: Record<string, unknown>) => ({
  id,
  journey_id: `j-${id}`,
  applicant_name: name,
  college_name: 'Test College',
  case_type: 'student',
  payer_method: 'college',
  expected_total: inr(100000),
  received_total: inr(0),
  balance: inr(100000),
  platform_due: inr(0),
  platform_outstanding: inr(0),
  platform_expected: inr(9000),
  platform_still_to_come: inr(4000.5),
  platform_paid: inr(0),
  platform_awaiting: inr(0),
  amount_state: 'open',
  by_currency: [],
  rate_percent: 10,
  rate_source: 'configured',
  accepted_at: '2026-09-01T00:00:00Z',
  case_closed: false,
  recognized_at: null,
  overdue_inr: 0,
  next_due_on: null,
  due_schedule: [],
  ...over,
})

function show(dues: unknown[]) {
  vi.mocked(useCommission).mockReturnValue({
    data: { currency: 'INR', running_total: 0, dues, payment_history: [], meta: {}, history_meta: {} },
    isLoading: false,
    isError: false,
  } as never)
  render(
    <MemoryRouter>
      <CommissionDetailsPage />
    </MemoryRouter>,
  )
}

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement

describe('Commission Details, the consultancy view', () => {
  it('shows "Not yet due" from platform_still_to_come, not from the whole share', () => {
    show([due('a', 'Asha Nair', {})])
    expect(within(rowOf('Asha Nair')).getByText('INR 4,000.50')).toBeInTheDocument()
    expect(within(rowOf('Asha Nair')).queryByText('INR 9,000.00')).not.toBeInTheDocument()
  })

  it('splits the cases into Active and Closed by case_closed', () => {
    show([due('a', 'Asha Nair', {}), due('b', 'Ravi Kumar', { case_closed: true })])
    expect(screen.getByRole('heading', { name: 'Active' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Closed' })).toBeInTheDocument()
    const [active, closed] = screen.getAllByRole('table')
    expect(within(active).getByText('Asha Nair')).toBeInTheDocument()
    expect(within(active).queryByText('Ravi Kumar')).not.toBeInTheDocument()
    expect(within(closed).getByText('Ravi Kumar')).toBeInTheDocument()
    expect(within(closed).queryByText('Asha Nair')).not.toBeInTheDocument()
  })

  it('has no Closed list when no case is closed', () => {
    show([due('a', 'Asha Nair', {})])
    expect(screen.queryByRole('heading', { name: 'Closed' })).not.toBeInTheDocument()
  })

  it('reads Open or Closed from amount_state, case by case', () => {
    show([
      due('a', 'Asha Nair', { amount_state: 'open' }),
      due('b', 'Ravi Kumar', { amount_state: 'closed', platform_paid: inr(960) }),
    ])
    expect(within(rowOf('Asha Nair')).getByText('Open')).toBeInTheDocument()
    expect(within(rowOf('Asha Nair')).queryByText('Closed')).not.toBeInTheDocument()
    expect(within(rowOf('Ravi Kumar')).getByText('Closed')).toBeInTheDocument()
    expect(within(rowOf('Ravi Kumar')).queryByText('Open')).not.toBeInTheDocument()
  })

  it('never shows a write-off: a case closed that way reads "Closed", with no figure', () => {
    show([due('a', 'Asha Nair', { platform_paid: inr(960), amount_state: 'closed' })])
    const row = rowOf('Asha Nair')
    expect(within(row).getByText('Closed')).toBeInTheDocument()
    expect(within(row).queryByText(/written off/i)).not.toBeInTheDocument()
    expect(within(row).queryByText(/Settled/)).not.toBeInTheDocument()
    expect(within(row).queryByText('INR 40.00')).not.toBeInTheDocument()
  })
})

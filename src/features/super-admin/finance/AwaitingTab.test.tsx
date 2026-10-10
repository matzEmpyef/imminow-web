import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Review F-300: the Awaiting list marks a row "More than owed" from the server's
// `exceeds_outstanding`, and compares nothing itself. It used to set the payment's own amount
// beside a rupee figure, which was wrong for every payment not in rupees.
const row = (id: string, consultancy: string, over: Record<string, unknown>) => ({
  id,
  status: 'declared',
  amount: { amount: 1000, currency: 'CAD' },
  amount_inr: 83000,
  entry_outstanding_inr: 500,
  consultancy_name: consultancy,
  applicant_name: `Applicant ${id}`,
  recorded_at: '2026-10-01T09:00:00Z',
  ...over,
})

const payments = [
  // The old comparison (1000 against ₹500) would have marked this; the server says it is not more.
  row('p1', 'Alpha Consult', { exceeds_outstanding: false }),
  row('p2', 'Beta Abroad', { exceeds_outstanding: true, exceeds_outstanding_by: { amount: 300, currency: 'CAD' } }),
  row('p3', 'Gamma Global', { exceeds_outstanding: null }),
  row('p4', 'Delta Study', {}),
]
vi.mock('@/queries/financeDashboard', () => ({
  useFinancePayments: () => ({ data: { items: payments, meta: { next_cursor: null, total: 4 } }, isLoading: false, isError: false }),
}))
vi.mock('@/queries/commission', () => ({
  useConfirmCommissionPayment: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  useConfirmPreview: () => ({ data: undefined, error: null, isFetching: false }),
  useRejectCommissionPayment: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { AwaitingTab } from './AwaitingTab'

const rowOf = (consultancy: string) => screen.getByText(consultancy).closest('tr') as HTMLElement

describe('the Awaiting list, "More than owed"', () => {
  it('marks only the row the server says is more than is owed', () => {
    render(<AwaitingTab />)
    expect(within(rowOf('Beta Abroad')).getByText('More than owed')).toBeInTheDocument()
    expect(screen.getAllByText('More than owed')).toHaveLength(1)
  })

  it('does not mark a row the server says is fine, however its figures compare', () => {
    render(<AwaitingTab />)
    expect(within(rowOf('Alpha Consult')).queryByText('More than owed')).not.toBeInTheDocument()
  })

  it('does not mark a row with no answer, null or absent', () => {
    render(<AwaitingTab />)
    expect(within(rowOf('Gamma Global')).queryByText('More than owed')).not.toBeInTheDocument()
    expect(within(rowOf('Delta Study')).queryByText('More than owed')).not.toBeInTheDocument()
  })
})

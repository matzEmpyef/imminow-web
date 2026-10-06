import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-159, on the screen itself: select a CAD and an INR payment, and the bulk-confirm button
// and the dialog it opens state the same total.
const payments = [
  {
    id: 'p1',
    status: 'declared',
    amount: { amount: 1000, currency: 'CAD' },
    amount_inr: 83000,
    consultancy_name: 'Alpha Consult',
    applicant_name: 'Asha Nair',
    recorded_at: '2026-10-01T09:00:00Z',
  },
  {
    id: 'p2',
    status: 'declared',
    amount: { amount: 5000, currency: 'INR' },
    amount_inr: null,
    consultancy_name: 'Beta Abroad',
    applicant_name: 'Ravi Menon',
    recorded_at: '2026-10-02T09:00:00Z',
  },
]
vi.mock('@/queries/financeDashboard', () => ({
  useFinancePayments: () => ({ data: { items: payments, meta: { next_cursor: null, total: 2 } }, isLoading: false, isError: false }),
}))
vi.mock('@/queries/commission', () => ({
  useConfirmCommissionPayment: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  useRejectCommissionPayment: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { AwaitingTab } from './AwaitingTab'

beforeEach(() => {
  render(<AwaitingTab />)
})

describe('the bulk-confirm total', () => {
  it('is the same on the button and in the dialog for a mixed-currency selection', () => {
    for (const box of screen.getAllByRole('checkbox')) if (!(box as HTMLInputElement).checked) fireEvent.click(box)
    const button = screen.getByRole('button', { name: /^Confirm 2 selected/ })
    expect(button).toHaveTextContent('Confirm 2 selected (≈ ₹88,000 (mixed currencies))')

    fireEvent.click(button)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Total declared:/)).toHaveTextContent('Total declared: ≈ ₹88,000 (mixed currencies)')
  })
})

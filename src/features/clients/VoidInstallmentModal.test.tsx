import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The Commissions tab's void (contract gate 11, F14): a reason is required before the button
// enables, and the mutation carries the entry, the installment and the trimmed reason.
vi.mock('@/queries/commissionEntries', () => ({ useVoidInstallment: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { useVoidInstallment } from '@/queries/commissionEntries'
import { VoidInstallmentModal } from './VoidInstallmentModal'

const mutate = vi.fn()

const installment = {
  id: 'inst-1',
  commission_entry_id: 'entry-1',
  source: 'student',
  amount: { amount: 50000, currency: 'INR' },
  received_on: '2026-09-30',
  note: null,
  receipt_id: null,
  created_at: '2026-09-30T08:00:00Z',
} as never

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useVoidInstallment).mockReturnValue({ mutate, isPending: false, isError: false, error: null } as never)
})

describe('VoidInstallmentModal', () => {
  it('keeps Void disabled until a reason is given, then sends it trimmed', () => {
    render(<VoidInstallmentModal clientId="c1" entryId="entry-1" installment={installment} onClose={() => {}} />)
    const button = screen.getByRole('button', { name: 'Void installment' })
    expect(button).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: '  Entered against the wrong source  ' } })
    expect(button).toBeEnabled()
    fireEvent.click(button)

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0][0]).toMatchObject({
      entryId: 'entry-1',
      installmentId: 'inst-1',
      reason: 'Entered against the wrong source',
    })
    expect(mutate.mock.calls[0][0].idempotencyKey).toBeTruthy()
  })

  it('shows the server refusal inline', () => {
    vi.mocked(useVoidInstallment).mockReturnValue({
      mutate,
      isPending: false,
      isError: true,
      error: new Error('A payment is already allocated to this installment.'),
    } as never)
    render(<VoidInstallmentModal clientId="c1" entryId="entry-1" installment={installment} onClose={() => {}} />)
    expect(screen.getByText(/already allocated/)).toBeInTheDocument()
  })
})

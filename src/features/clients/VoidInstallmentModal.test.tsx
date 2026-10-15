import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The Commissions tab's void (contract gate 11, F14): a reason is required before the button
// enables, and the mutation carries the entry, the installment and the trimmed reason.
vi.mock('@/queries/commissionEntries', () => ({ useVoidInstallment: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { useVoidInstallment } from '@/queries/commissionEntries'
import { showToast } from '@/lib/toast'
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
    const button = screen.getByRole('button', { name: 'Void instalment' })
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
      error: new Error('A payment is already allocated to this instalment.'),
    } as never)
    render(<VoidInstallmentModal clientId="c1" entryId="entry-1" installment={installment} onClose={() => {}} />)
    expect(screen.getByText(/already allocated/)).toBeInTheDocument()
  })
})

// Review F-078: when the installment's share is already due the server keeps the installment and
// passes the void to immiNow Finance. The answer says so; the dialog must not claim it was voided.
describe('VoidInstallmentModal, a void that needs immiNow Finance', () => {
  function voidWith(result: Record<string, unknown>) {
    mutate.mockImplementation((_vars, options: { onSuccess: (r: unknown) => void }) => options.onSuccess(result))
    const onClose = vi.fn()
    render(<VoidInstallmentModal clientId="c1" entryId="entry-1" installment={installment} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Entered twice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Void instalment' }))
    return onClose
  }

  beforeEach(() => vi.mocked(showToast).mockReset())

  it('says the void was sent for approval when the server is waiting for Finance', () => {
    const onClose = voidWith({ id: 'inst-1', voided_at: null, void_requested_at: '2026-10-08T09:00:00Z' })
    expect(showToast).toHaveBeenCalledWith('Void sent to immiNow Finance for approval')
    expect(onClose).toHaveBeenCalled()
  })

  // Owner's ruling 2026-10-10: the same while a Finance override is in force on the case. Nothing
  // on the screen tells the two apart in advance, so the dialog does not promise an immediate void
  // and its words follow the server's answer, whatever the reason for the request.
  it('does not promise an immediate void before it is sent', () => {
    render(<VoidInstallmentModal clientId="c1" entryId="entry-1" installment={installment} onClose={() => {}} />)
    expect(screen.getByText(/Finance has set its own amount for the case/)).toBeInTheDocument()
    expect(screen.getByText(/sent to immiNow Finance as a request instead/)).toBeInTheDocument()
  })

  it('says it was voided when the server voided it at once', () => {
    voidWith({ id: 'inst-1', voided_at: '2026-10-08T09:00:00Z', void_requested_at: null })
    expect(showToast).toHaveBeenCalledWith('Instalment voided')
  })

  it('shows the server’s sentence when a void is already waiting', () => {
    vi.mocked(useVoidInstallment).mockReturnValue({
      mutate,
      isPending: false,
      isError: true,
      error: new Error('A void of this instalment is already waiting for Finance.'),
    } as never)
    render(<VoidInstallmentModal clientId="c1" entryId="entry-1" installment={installment} onClose={() => {}} />)
    expect(screen.getByText(/already waiting for Finance/)).toBeInTheDocument()
  })
})

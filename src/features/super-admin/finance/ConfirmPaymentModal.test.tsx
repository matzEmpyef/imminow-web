import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-300: the confirm dialog works nothing out. It asks the server's preview as the amount
// changes and shows what comes back — whether the amount differs, whether that needs a note,
// whether it is more than the case owes. An accepted over-payment is sent with `allow_overpayment`.
vi.mock('@/queries/commission', () => ({ useConfirmCommissionPayment: vi.fn(), useConfirmPreview: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useConfirmCommissionPayment, useConfirmPreview } from '@/queries/commission'
import { ConfirmPaymentModal } from './ConfirmPaymentModal'

const mutate = vi.fn()
const reset = vi.fn()

function mutation(error: Error | null = null) {
  return { mutate, reset, isPending: false, isError: Boolean(error), error } as never
}

/** What the server's preview answers; nothing here is worked out by the dialog. */
function previewAnswer(over: Record<string, unknown> = {}, error: Error | null = null) {
  const data = error
    ? undefined
    : {
        currency: 'CAD',
        declared_amount: { amount: 500, currency: 'CAD' },
        received_amount: { amount: 500, currency: 'CAD' },
        differs: false,
        difference_from_declared: { amount: 0, currency: 'CAD' },
        difference_direction: 'same',
        needs_note: false,
        outstanding: { amount: 800, currency: 'CAD' },
        due_now: { amount: 600, currency: 'CAD' },
        due_now_inr: { amount: 36900, currency: 'INR' },
        still_to_come: { amount: 200, currency: 'CAD' },
        still_to_come_inr: { amount: 12300, currency: 'INR' },
        is_overpayment: false,
        overpaid_by: null,
        rate: 61.5,
        received_amount_inr: { amount: 30750, currency: 'INR' },
        ...over,
      }
  return { data, error, isFetching: false } as never
}

const payment = {
  id: 'p1',
  amount: { amount: 500, currency: 'CAD' },
  consultancy_name: 'Alpha Consult',
  entry_outstanding: { amount: 800, currency: 'CAD' },
} as never

function open() {
  render(<ConfirmPaymentModal payment={payment} onClose={() => {}} />)
}

const amountBox = () => screen.getByLabelText(/Amount received/)
const confirmButton = () => screen.getByRole('button', { name: 'Confirm received' })
const sent = (call = 0) => mutate.mock.calls[call][0] as Record<string, unknown>
const lastCall = () => {
  const calls = vi.mocked(useConfirmPreview).mock.calls
  return calls[calls.length - 1]
}

const differentAnswer = previewAnswer({
  received_amount: { amount: 450, currency: 'CAD' },
  differs: true,
  difference_from_declared: { amount: -50, currency: 'CAD' },
  difference_direction: 'less',
  needs_note: true,
})

beforeEach(() => {
  mutate.mockReset()
  reset.mockReset()
  vi.mocked(useConfirmCommissionPayment).mockReturnValue(mutation())
  vi.mocked(useConfirmPreview).mockReset()
  vi.mocked(useConfirmPreview).mockReturnValue(previewAnswer())
})

describe('ConfirmPaymentModal, the preview', () => {
  it('asks about the amount as typed once typing pauses, and never about a bad one', async () => {
    vi.mocked(useConfirmPreview).mockReturnValue({ data: undefined, error: null, isFetching: false } as never)
    open()
    expect(lastCall().slice(0, 2)).toEqual(['p1', 500])
    fireEvent.change(amountBox(), { target: { value: '450' } })
    // Typing is not followed by a request on every key: the old amount is still the one asked.
    expect(lastCall()[1]).not.toBe(450)
    await waitFor(() => expect(lastCall().slice(0, 2)).toEqual(['p1', 450]))

    fireEvent.change(amountBox(), { target: { value: '450.123' } })
    await waitFor(() => expect(lastCall()[1]).toBeUndefined())
    expect(lastCall()[2]).toBe(false)
  })

  it('keeps the button off until the answer for this amount is in', () => {
    vi.mocked(useConfirmPreview).mockReturnValue({ data: undefined, error: null, isFetching: true } as never)
    open()
    expect(confirmButton()).toBeDisabled()
  })

  it('confirms the declared amount with no note and no over-payment flag when the server finds nothing to say', () => {
    open()
    expect(screen.queryByLabelText(/Why is it different/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/record it anyway/)).not.toBeInTheDocument()
    expect(confirmButton()).toBeEnabled()
    fireEvent.click(confirmButton())
    expect(sent()).toEqual({ paymentId: 'p1', receivedAmount: 500, note: undefined, allow_overpayment: undefined })
  })

  it('asks for the reason only when the server says the amount needs one, and shows its difference', async () => {
    vi.mocked(useConfirmPreview).mockReturnValue(differentAnswer)
    open()
    fireEvent.change(amountBox(), { target: { value: '450' } })
    const why = await screen.findByLabelText(/Why is it different/)
    expect(screen.getByText(/Declared CAD 500\.00 · Received CAD 450\.00 · Difference CAD -50\.00 \(less than declared\)/)).toBeInTheDocument()
    expect(confirmButton()).toBeDisabled()
    fireEvent.change(why, { target: { value: 'Bank fee taken' } })
    expect(confirmButton()).toBeEnabled()
    fireEvent.click(confirmButton())
    expect(sent()).toMatchObject({ receivedAmount: 450, note: 'Bank fee taken' })
  })

  it('needs no reason when the server says the amount does not differ, however it is typed', async () => {
    open()
    fireEvent.change(amountBox(), { target: { value: '500.00' } })
    await waitFor(() => expect(lastCall()[1]).toBe(500))
    expect(screen.queryByLabelText(/Why is it different/)).not.toBeInTheDocument()
    expect(confirmButton()).toBeEnabled()
  })

  it('shows the rupee value and rate the server gives for a foreign-currency payment', () => {
    open()
    expect(screen.getByText('≈ ₹30,750.00 at 61.5')).toBeInTheDocument()
  })

  it('shows at most six decimals of a long rate', () => {
    vi.mocked(useConfirmPreview).mockReturnValue(previewAnswer({ rate: 61.50000000000001 }))
    open()
    expect(screen.getByText('≈ ₹30,750.00 at 61.5')).toBeInTheDocument()
    vi.mocked(useConfirmPreview).mockReturnValue(previewAnswer({ rate: 1.1234567891234568 }))
    cleanup()
    open()
    expect(screen.getByText('≈ ₹30,750.00 at 1.123457')).toBeInTheDocument()
  })

  it('says what is due now and what is still to come, each with its own rupee value, as the server gave them', () => {
    open()
    expect(screen.getByText('Due now')).toBeInTheDocument()
    expect(screen.getByText('CAD 600.00')).toBeInTheDocument()
    expect(screen.getByText('≈ ₹36,900.00')).toBeInTheDocument()
    expect(screen.getByText('Still to come when the college pays')).toBeInTheDocument()
    expect(screen.getByText('CAD 200.00')).toBeInTheDocument()
    expect(screen.getByText('≈ ₹12,300.00')).toBeInTheDocument()
    expect(screen.queryByText(/Case still owes|Outstanding on this case/)).not.toBeInTheDocument()
  })

  it('leaves the second line out when nothing is still to come, and a rupee value that was not served', () => {
    vi.mocked(useConfirmPreview).mockReturnValue(
      previewAnswer({
        due_now: { amount: 0, currency: 'CAD' },
        due_now_inr: null,
        still_to_come: { amount: 0, currency: 'CAD' },
        still_to_come_inr: null,
      }),
    )
    open()
    expect(screen.getByText('Due now')).toBeInTheDocument()
    expect(screen.getByText('CAD 0.00')).toBeInTheDocument()
    expect(screen.queryByText('Still to come when the college pays')).not.toBeInTheDocument()
    expect(screen.queryByText('≈ ₹36,900.00')).not.toBeInTheDocument()
  })

  it('shows the list’s due-now figure until the preview answers', () => {
    vi.mocked(useConfirmPreview).mockReturnValue({ data: undefined, error: null, isFetching: true } as never)
    open()
    expect(screen.getByText('Due now')).toBeInTheDocument()
    expect(screen.getByText('CAD 800.00')).toBeInTheDocument()
    expect(screen.queryByText('Still to come when the college pays')).not.toBeInTheDocument()
  })

  it('shows the server’s over-payment figures and sends allow_overpayment only once it is ticked', async () => {
    vi.mocked(useConfirmPreview).mockReturnValue(
      previewAnswer({
        received_amount: { amount: 2000, currency: 'CAD' },
        differs: true,
        needs_note: true,
        difference_from_declared: { amount: 1500, currency: 'CAD' },
        difference_direction: 'more',
        is_overpayment: true,
        overpaid_by: { amount: 1200, currency: 'CAD' },
      }),
    )
    open()
    fireEvent.change(amountBox(), { target: { value: '2000' } })
    fireEvent.change(await screen.findByLabelText(/Why is it different/), { target: { value: 'Paid in advance' } })
    expect(screen.getByRole('alert')).toHaveTextContent('That’s CAD 1,200.00 more than this case can still receive (CAD 800.00).')
    expect(confirmButton()).toBeDisabled()
    fireEvent.click(screen.getByLabelText('It is an over-payment — record it anyway'))
    fireEvent.click(confirmButton())
    expect(sent()).toMatchObject({ receivedAmount: 2000, note: 'Paid in advance', allow_overpayment: true })
  })

  it('does not warn when the server says it is not an over-payment', () => {
    vi.mocked(useConfirmPreview).mockReturnValue(previewAnswer({ is_overpayment: false }))
    open()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the server’s sentence when the preview refuses, and does not stop the typing', () => {
    vi.mocked(useConfirmPreview).mockReturnValue(
      previewAnswer({}, new ApiError('x', { error: { code: 'conflict', message: 'This payment is no longer awaiting confirmation.' } }, 409)),
    )
    open()
    expect(screen.getByText('This payment is no longer awaiting confirmation.')).toBeInTheDocument()
    expect(confirmButton()).toBeEnabled()
  })
})

describe('ConfirmPaymentModal, the server’s own refusal of an over-payment', () => {
  const tooMuch = new ApiError(
    'x',
    { error: { code: 'more_than_outstanding', message: 'Only CAD 800.00 is still unpaid on this case.' } },
    409,
  )

  it('shows the server’s sentence with the tick, and sends the confirmation again with allow_overpayment', () => {
    vi.mocked(useConfirmCommissionPayment).mockReturnValue(mutation(tooMuch))
    open()
    expect(screen.getByRole('alert')).toHaveTextContent('Only CAD 800.00 is still unpaid on this case.')
    expect(confirmButton()).toBeDisabled()
    fireEvent.click(screen.getByLabelText('It is an over-payment — record it anyway'))
    fireEvent.click(confirmButton())
    expect(sent()).toMatchObject({ paymentId: 'p1', allow_overpayment: true })
  })

  it('drops the refusal and the tick when the amount is changed', () => {
    vi.mocked(useConfirmCommissionPayment).mockReturnValue(mutation(tooMuch))
    open()
    fireEvent.click(screen.getByLabelText('It is an over-payment — record it anyway'))
    reset.mockClear()
    fireEvent.change(amountBox(), { target: { value: '400' } })
    expect(reset).toHaveBeenCalled()
    expect(screen.getByLabelText('It is an over-payment — record it anyway')).not.toBeChecked()
  })

  it('shows any other refusal as its own sentence, with no tick', () => {
    vi.mocked(useConfirmCommissionPayment).mockReturnValue(
      mutation(new ApiError('x', { error: { code: 'entry_not_active', message: 'This case was voided.' } }, 409)),
    )
    open()
    expect(screen.getByText('This case was voided.')).toBeInTheDocument()
    expect(screen.queryByLabelText(/record it anyway/)).not.toBeInTheDocument()
  })
})

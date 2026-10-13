import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-227: a correction UPWARDS is held to what is still unpaid on the case. The server
// answers 409 `more_than_outstanding`; the dialog shows its sentence with the same "record it
// anyway" tick the receive dialog offers, and sends the correction again with `allow_overpayment`.
vi.mock('@/queries/commission', () => ({ useCorrectCommissionPayment: vi.fn(), useCorrectPreview: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useCorrectCommissionPayment, useCorrectPreview } from '@/queries/commission'
import { CorrectPaymentModal } from './CorrectPaymentModal'

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
        current_amount: { amount: 1000, currency: 'CAD' },
        amount: { amount: 2000, currency: 'CAD' },
        change: { amount: 1000, currency: 'CAD' },
        change_direction: 'more',
        outstanding: { amount: 400, currency: 'CAD' },
        due_now: { amount: 300, currency: 'CAD' },
        due_now_inr: { amount: 18450, currency: 'INR' },
        still_to_come: { amount: 100, currency: 'CAD' },
        still_to_come_inr: { amount: 6150, currency: 'INR' },
        is_overpayment: false,
        overpaid_by: null,
        rate: 61.5,
        overpaid_by_inr: null,
        ...over,
      }
  return { data, error, isFetching: false } as never
}

const payment = {
  id: 'p1',
  amount: { amount: 1000, currency: 'CAD' },
  consultancy_name: 'Alpha Consult',
  corrections: [],
} as never

const tooMuch = new ApiError(
  'x',
  {
    error: {
      code: 'more_than_outstanding',
      message: 'Only CAD 400 is still unpaid on this case.',
      details: { outstanding: 400 },
    },
  },
  409,
)

function open() {
  render(<CorrectPaymentModal payment={payment} onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText(/New amount received/), { target: { value: '2000' } })
  fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Bank statement shows more' } })
}

const save = () => screen.getByRole('button', { name: 'Save correction' })
const sent = (call = 0) => mutate.mock.calls[call][0] as Record<string, unknown>

beforeEach(() => {
  mutate.mockReset()
  reset.mockReset()
  vi.mocked(useCorrectCommissionPayment).mockReturnValue(mutation())
  vi.mocked(useCorrectPreview).mockReset()
  vi.mocked(useCorrectPreview).mockReturnValue({ data: undefined, error: null, isFetching: false } as never)
})

describe('CorrectPaymentModal — a correction above what is still unpaid', () => {
  it('sends a correction with no over-payment flag the first time', () => {
    open()
    fireEvent.click(save())
    expect(sent()).toEqual({
      paymentId: 'p1',
      amount: 2000,
      reason: 'Bank statement shows more',
      allow_overpayment: undefined,
    })
    expect(screen.queryByLabelText(/It is an over-payment/)).not.toBeInTheDocument()
  })

  it('shows the server’s sentence with the tick, and resends only once it is ticked', () => {
    vi.mocked(useCorrectCommissionPayment).mockReturnValue(mutation(tooMuch))
    open()
    // Changing the amount cleared the last answer; the mock keeps returning it, as after a new refusal.
    expect(screen.getByRole('alert')).toHaveTextContent('Only CAD 400 is still unpaid on this case.')
    expect(save()).toBeDisabled()

    fireEvent.click(screen.getByLabelText('It is an over-payment — record it anyway'))
    expect(save()).toBeEnabled()
    fireEvent.click(save())
    expect(sent()).toMatchObject({ paymentId: 'p1', amount: 2000, allow_overpayment: true })
  })

  it('drops the refusal and the tick when the amount is changed', () => {
    vi.mocked(useCorrectCommissionPayment).mockReturnValue(mutation(tooMuch))
    open()
    fireEvent.click(screen.getByLabelText('It is an over-payment — record it anyway'))
    reset.mockClear()
    fireEvent.change(screen.getByLabelText(/New amount received/), { target: { value: '1200' } })
    expect(reset).toHaveBeenCalled()
    expect(screen.getByLabelText('It is an over-payment — record it anyway')).not.toBeChecked()
  })

  it('shows any other refusal as its own sentence, with no tick', () => {
    vi.mocked(useCorrectCommissionPayment).mockReturnValue(
      mutation(new ApiError('x', { error: { code: 'conflict', message: 'This payment is not confirmed.' } }, 409)),
    )
    open()
    expect(screen.getByText('This payment is not confirmed.')).toBeInTheDocument()
    expect(screen.queryByLabelText(/It is an over-payment/)).not.toBeInTheDocument()
    expect(save()).toBeEnabled()
  })
})

// Review F-300: the dialog works nothing out. It asks the server's preview as the amount changes and
// shows what comes back.
describe('CorrectPaymentModal, the preview', () => {
  const lastCall = () => {
    const calls = vi.mocked(useCorrectPreview).mock.calls
    return calls[calls.length - 1]
  }

  it('asks about the new amount once typing pauses, and never about a bad one or the amount on record', async () => {
    render(<CorrectPaymentModal payment={payment} onClose={() => {}} />)
    // The amount on record is not a correction: nothing is asked.
    expect(lastCall()[1]).toBeUndefined()
    fireEvent.change(screen.getByLabelText(/New amount received/), { target: { value: '1500' } })
    // Typing is not followed by a request on every key.
    expect(lastCall()[1]).not.toBe(1500)
    await waitFor(() => expect(lastCall().slice(0, 2)).toEqual(['p1', 1500]))

    fireEvent.change(screen.getByLabelText(/New amount received/), { target: { value: '1500.123' } })
    await waitFor(() => expect(lastCall()[1]).toBeUndefined())
  })

  it('shows the server’s change, and no figure for what is unpaid (the preview’s are from before the change)', async () => {
    vi.mocked(useCorrectPreview).mockReturnValue(previewAnswer())
    open()
    expect(await screen.findByText(/Change: CAD 1,000\.00 \(more than now\)/)).toBeInTheDocument()
    expect(screen.queryByText(/Still unpaid/)).not.toBeInTheDocument()
    expect(screen.queryByText(/CAD 400\.00/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/It is an over-payment/)).not.toBeInTheDocument()
    expect(save()).toBeEnabled()
  })

  it('shows the server’s over-payment figures, with the rupee value, and holds the button until it is ticked', async () => {
    vi.mocked(useCorrectPreview).mockReturnValue(
      previewAnswer({
        is_overpayment: true,
        overpaid_by: { amount: 600, currency: 'CAD' },
        overpaid_by_inr: { amount: 36900, currency: 'INR' },
      }),
    )
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent('That’s CAD 600.00 (≈ ₹36,900.00) more than this case can still receive (CAD 400.00).')
    expect(save()).toBeDisabled()
    fireEvent.click(screen.getByLabelText('It is an over-payment — record it anyway'))
    fireEvent.click(save())
    expect(sent()).toMatchObject({ paymentId: 'p1', amount: 2000, allow_overpayment: true })
  })

  it('does not warn when the server says it is not an over-payment, whatever the amounts look like', async () => {
    vi.mocked(useCorrectPreview).mockReturnValue(previewAnswer({ is_overpayment: false }))
    open()
    await screen.findByText(/Change:/)
    expect(screen.queryByLabelText(/It is an over-payment/)).not.toBeInTheDocument()
    fireEvent.click(save())
    expect(sent().allow_overpayment).toBeUndefined()
  })

  it('shows the server’s sentence when the preview refuses, and does not stop the typing', async () => {
    vi.mocked(useCorrectPreview).mockReturnValue(
      previewAnswer({}, new ApiError('x', { error: { code: 'conflict', message: 'This payment is not confirmed.' } }, 409)),
    )
    open()
    expect(await screen.findByText('This payment is not confirmed.')).toBeInTheDocument()
    expect(save()).toBeEnabled()
  })

  it('does not tell a zero correction that rupees bounced, whatever the currency', async () => {
    vi.mocked(useCorrectPreview).mockReturnValue(previewAnswer())
    open()
    expect(screen.getByText('Enter 0 if no money arrived, for example when a cheque bounced.')).toBeInTheDocument()
    expect(screen.queryByText(/₹0/)).not.toBeInTheDocument()
  })

  it('does no arithmetic of its own: a mixed-up preview is shown as it came', async () => {
    vi.mocked(useCorrectPreview).mockReturnValue(
      previewAnswer({ change: { amount: 7, currency: 'CAD' }, outstanding: { amount: 3, currency: 'CAD' } }),
    )
    open()
    expect(await screen.findByText(/Change: CAD 7\.00/)).toBeInTheDocument()
  })
})

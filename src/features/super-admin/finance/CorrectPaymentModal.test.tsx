import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-227: a correction UPWARDS is held to what is still unpaid on the case. The server
// answers 409 `more_than_outstanding`; the dialog shows its sentence with the same "record it
// anyway" tick the receive dialog offers, and sends the correction again with `allow_overpayment`.
vi.mock('@/queries/commission', () => ({ useCorrectCommissionPayment: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useCorrectCommissionPayment } from '@/queries/commission'
import { CorrectPaymentModal } from './CorrectPaymentModal'

const mutate = vi.fn()
const reset = vi.fn()

function mutation(error: Error | null = null) {
  return { mutate, reset, isPending: false, isError: Boolean(error), error } as never
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

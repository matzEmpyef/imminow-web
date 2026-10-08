import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-079: Finance records a payment that reached the bank in another currency than the one
// owed. The dialog sends what arrived and which dues it settles; the server converts. Nothing is
// converted in the browser.
vi.mock('@/queries/financeDashboard', () => ({ useReceiveCommissionDue: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useReceiveCommissionDue } from '@/queries/financeDashboard'
import { ReceiveDueModal } from './ReceiveDueModal'

const mutate = vi.fn()
const reset = vi.fn()

function mutation(error: Error | null = null) {
  return { mutate, reset, isPending: false, isError: Boolean(error), error } as never
}

const caseRow = (currencies: string[]) =>
  ({
    id: 'e1',
    applicant_name: 'Aiko Tanaka',
    consultancy_name: 'Alpha Consult',
    by_currency: currencies.map((currency) => ({ currency, outstanding: 1400 })),
  }) as never

const part = { key: 'p1', currency: 'CAD', amount: 1400, outstanding: 1400 } as never

function open(row = caseRow(['CAD']), duePart: unknown = null) {
  return render(<ReceiveDueModal caseRow={row} part={duePart as never} onClose={() => {}} onReceived={() => {}} />)
}

const submit = () => screen.getByRole('button', { name: /Record payment|Mark as received/ })
const tickOtherCurrency = () => fireEvent.click(screen.getByLabelText('It arrived in another currency'))
const sent = () => mutate.mock.calls[0][0] as Record<string, unknown>

beforeEach(() => {
  mutate.mockReset()
  reset.mockReset()
  vi.mocked(useReceiveCommissionDue).mockReturnValue(mutation())
})

describe('ReceiveDueModal, a payment in the currency owed', () => {
  it('sends none of the other-currency fields', () => {
    open()
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '500' } })
    fireEvent.click(submit())
    expect(sent()).toMatchObject({ entryId: 'e1', amount: 500, currency: 'CAD' })
    expect(sent()).not.toHaveProperty('allow_cross_currency')
    expect(sent()).not.toHaveProperty('owed_currency')
    expect(sent()).not.toHaveProperty('rate')
  })

  it('points at the other-currency path when the server says nothing is owed in that currency', () => {
    vi.mocked(useReceiveCommissionDue).mockReturnValue(
      mutation(new ApiError('x', { error: { code: 'currency_not_owed', message: 'Nothing is owed in USD on this case.' } }, 422)),
    )
    open()
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing is owed in USD on this case.')
    expect(screen.getByText(/tick .It arrived in another currency/)).toBeInTheDocument()
  })
})

describe('ReceiveDueModal, it arrived in another currency', () => {
  it('sends what arrived, the owed currency and the rate', () => {
    open()
    tickOtherCurrency()
    fireEvent.change(screen.getByLabelText(/Amount received/), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Currency received'), { target: { value: 'USD' } })
    fireEvent.change(screen.getByLabelText('Rate'), { target: { value: '1.4' } })
    expect(screen.getByText(/1 USD settles how many CAD\. Leave empty to use today.s rate\./)).toBeInTheDocument()
    fireEvent.click(submit())

    expect(sent()).toMatchObject({
      amount: 1000,
      currency: 'USD',
      allow_cross_currency: true,
      owed_currency: 'CAD',
      rate: 1.4,
    })
    expect(sent().idempotencyKey).toBeTruthy()
  })

  it('leaves the rate out when it is left empty, so the server uses today’s', () => {
    open()
    tickOtherCurrency()
    fireEvent.change(screen.getByLabelText(/Amount received/), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Currency received'), { target: { value: 'USD' } })
    fireEvent.click(submit())
    expect(sent()).toMatchObject({ allow_cross_currency: true, owed_currency: 'CAD' })
    expect(sent().rate).toBeUndefined()
  })

  it('requires the owed currency when the case owes several', () => {
    open(caseRow(['CAD', 'INR']))
    tickOtherCurrency()
    fireEvent.change(screen.getByLabelText(/Amount received/), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Currency received'), { target: { value: 'USD' } })
    expect(submit()).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Currency owed'), { target: { value: 'INR' } })
    expect(submit()).toBeEnabled()
    fireEvent.click(submit())
    expect(sent()).toMatchObject({ currency: 'USD', owed_currency: 'INR' })
  })

  it('refuses the currency owed as the currency received', () => {
    open()
    tickOtherCurrency()
    fireEvent.change(screen.getByLabelText(/Amount received/), { target: { value: '1000' } })
    // Still on CAD, which is what is owed.
    expect(screen.getByText(/CAD is the currency owed/)).toBeInTheDocument()
    expect(submit()).toBeDisabled()
  })

  it('on a part settles the part’s own currency and names no owed currency', () => {
    open(caseRow(['CAD', 'INR']), part)
    tickOtherCurrency()
    // The pre-filled figure was the part's outstanding, in the owed currency: it is cleared.
    expect(screen.getByLabelText(/Amount received/)).toHaveValue(null)
    fireEvent.change(screen.getByLabelText(/Amount received/), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Currency received'), { target: { value: 'USD' } })
    fireEvent.click(submit())
    expect(sent()).toMatchObject({ part_key: 'p1', currency: 'USD', allow_cross_currency: true })
    expect(sent().owed_currency).toBeUndefined()
  })

  it('shows the server’s "more than is outstanding" and resends only once it is confirmed', () => {
    vi.mocked(useReceiveCommissionDue).mockReturnValue(
      mutation(
        new ApiError(
          'x',
          { error: { code: 'more_than_outstanding', message: 'Only CAD 1,400 is outstanding on this case.' } },
          409,
        ),
      ),
    )
    open()
    tickOtherCurrency()
    // Ticking the path clears the last answer; the mock keeps returning it, as after a new refusal.
    fireEvent.change(screen.getByLabelText('Currency received'), { target: { value: 'USD' } })
    fireEvent.change(screen.getByLabelText(/Amount received/), { target: { value: '2000' } })
    expect(screen.getByText('Only CAD 1,400 is outstanding on this case.')).toBeInTheDocument()
    expect(submit()).toBeDisabled()

    fireEvent.click(screen.getByLabelText(/Record it anyway/))
    fireEvent.click(submit())
    expect(sent()).toMatchObject({ allow_cross_currency: true, allow_overpayment: true })
  })
})

// Review I-026: a reference is at most 200 characters and is not repeated on one case.
describe('ReceiveDueModal, the reference', () => {
  it('stops at 200 characters', () => {
    open()
    expect(screen.getByLabelText('Reference')).toHaveAttribute('maxlength', '200')
  })

  it('shows the server’s sentence beside the field when the reference is already recorded', () => {
    const message = 'A payment with this transaction reference is already recorded for this case.'
    vi.mocked(useReceiveCommissionDue).mockReturnValue(
      mutation(new ApiError('x', { error: { code: 'already_exists', message } }, 409)),
    )
    open()
    expect(screen.getByLabelText('Reference')).toHaveAccessibleDescription(message)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // Changing the reference clears the refusal, which was about the one that was sent.
    fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'UTR-2' } })
    expect(reset).toHaveBeenCalled()
  })
})

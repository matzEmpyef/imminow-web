import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-079: Finance records a payment that reached the bank in another currency than the one
// owed. The dialog sends what arrived and which dues it settles; the server converts. Nothing is
// converted in the browser.
vi.mock('@/queries/financeDashboard', () => ({ useReceiveCommissionDue: vi.fn(), useReceivePreview: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useReceiveCommissionDue, useReceivePreview } from '@/queries/financeDashboard'
import { ReceiveDueModal } from './ReceiveDueModal'

const mutate = vi.fn()
const reset = vi.fn()

/** What the server's preview answers; nothing here is worked out by the dialog. */
function previewAnswer(over: Record<string, unknown> = {}, error: Error | null = null) {
  const data = error
    ? undefined
    : {
        currency: 'CAD',
        owed_currency: 'CAD',
        outstanding: { amount: 1400, currency: 'CAD' },
        due_now: { amount: 1000, currency: 'CAD' },
        due_now_inr: { amount: 61500, currency: 'INR' },
        still_to_come: { amount: 400, currency: 'CAD' },
        still_to_come_inr: { amount: 24600, currency: 'INR' },
        part_outstanding: null,
        amount: null,
        settles: null,
        rate: null,
        is_overpayment: false,
        overpaid_by: null,
        ...over,
      }
  return { data, error, isFetching: false } as never
}

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
  vi.mocked(useReceivePreview).mockReset()
  vi.mocked(useReceivePreview).mockReturnValue({ data: undefined, error: null, isFetching: false } as never)
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

// Review F-300: the dialog works nothing out. It asks the server's preview as the draft changes and
// shows what comes back.
describe('ReceiveDueModal, the preview', () => {
  const lastDraft = () => {
    const calls = vi.mocked(useReceivePreview).mock.calls
    return calls[calls.length - 1][1] as Record<string, unknown>
  }

  it('asks about the draft as it would be sent, once typing pauses, and never with a bad amount', async () => {
    open(caseRow(['CAD']), part)
    expect(vi.mocked(useReceivePreview).mock.calls[0][0]).toBe('e1')
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '500' } })
    // Typing is not followed by a request on every key: the old draft is still the one asked.
    expect(lastDraft().amount).not.toBe(500)
    await waitFor(() => expect(lastDraft()).toMatchObject({ part_key: 'p1', currency: 'CAD', amount: 500 }))

    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '500.123' } })
    await waitFor(() => expect(lastDraft().amount).toBeUndefined())
  })

  it('offers the amount the server gives for the part, until the amount is touched', () => {
    vi.mocked(useReceivePreview).mockReturnValue(
      previewAnswer({ part_outstanding: { amount: 1234.56, currency: 'CAD' } }),
    )
    open(caseRow(['CAD']), part)
    expect(screen.getByLabelText(/Amount/)).toHaveValue(1234.56)
  })

  it('shows the server’s over-payment figures and holds the button until it is confirmed', async () => {
    vi.mocked(useReceivePreview).mockReturnValue(
      previewAnswer({
        amount: { amount: 2000, currency: 'CAD' },
        is_overpayment: true,
        overpaid_by: { amount: 600, currency: 'CAD' },
      }),
    )
    open()
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '2000' } })
    // The hint speaks of the whole case, not of one part.
    expect(await screen.findByText(/more than this case can still receive/)).toHaveTextContent('That’s CAD 600.00 more than this case can still receive (CAD 1,400.00).')
    expect(submit()).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/Record it anyway/))
    fireEvent.click(submit())
    expect(sent()).toMatchObject({ amount: 2000, allow_overpayment: true })
  })

  it('does not warn when the server says it is not an over-payment, whatever the part looks like', async () => {
    open(caseRow(['CAD']), { key: 'p1', currency: 'CAD', amount: 10, outstanding: 10 })
    vi.mocked(useReceivePreview).mockReturnValue(previewAnswer({ is_overpayment: false }))
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '5000' } })
    expect(await screen.findByText('Due now')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Record it anyway/)).not.toBeInTheDocument()
    expect(submit()).toBeEnabled()
    fireEvent.click(submit())
    expect(sent().allow_overpayment).toBeUndefined()
  })

  it('shows the server’s sentence when the preview refuses, and does not stop the typing', async () => {
    vi.mocked(useReceivePreview).mockReturnValue(
      previewAnswer({}, new ApiError('x', { error: { code: 'currency_not_owed', message: 'Nothing is owed in USD on this case.' } }, 422)),
    )
    open()
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '500' } })
    expect(await screen.findByText('Nothing is owed in USD on this case.')).toBeInTheDocument()
    expect(submit()).toBeEnabled()
  })

  it('says what a payment in another currency settles, from the server’s figures', async () => {
    vi.mocked(useReceivePreview).mockReturnValue(
      previewAnswer({
        currency: 'USD',
        amount: { amount: 1000, currency: 'USD' },
        settles: { amount: 1400, currency: 'CAD' },
        rate: 1.4000000000000001,
      }),
    )
    open()
    tickOtherCurrency()
    fireEvent.change(screen.getByLabelText(/Amount received/), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Currency received'), { target: { value: 'USD' } })
    expect(await screen.findByText(/That settles CAD 1,400\.00 of the CAD dues \(1 USD = 1\.4 CAD\)/)).toBeInTheDocument()
  })

  it('says what is due now and what is still to come, each with its rupee value, and nothing is added', async () => {
    vi.mocked(useReceivePreview).mockReturnValue(previewAnswer())
    open()
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '500' } })
    expect(await screen.findByText('Due now')).toBeInTheDocument()
    expect(screen.getByText('CAD 1,000.00')).toBeInTheDocument()
    expect(screen.getByText('≈ ₹61,500.00')).toBeInTheDocument()
    expect(screen.getByText('Still to come when the college pays')).toBeInTheDocument()
    expect(screen.getByText('CAD 400.00')).toBeInTheDocument()
    expect(screen.getByText('≈ ₹24,600.00')).toBeInTheDocument()
    expect(screen.queryByText(/Outstanding on this case/)).not.toBeInTheDocument()
  })

  it('leaves the second line out on a paid-up case, and shows no rupee value that was not served', async () => {
    vi.mocked(useReceivePreview).mockReturnValue(
      previewAnswer({
        due_now: { amount: 0, currency: 'CAD' },
        due_now_inr: null,
        still_to_come: { amount: 0, currency: 'CAD' },
        still_to_come_inr: null,
      }),
    )
    open()
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '500' } })
    expect(await screen.findByText('Due now')).toBeInTheDocument()
    expect(screen.getByText('CAD 0.00')).toBeInTheDocument()
    expect(screen.queryByText('Still to come when the college pays')).not.toBeInTheDocument()
    expect(screen.queryByText(/≈ ₹/)).not.toBeInTheDocument()
  })
})

// Owner's ruling 2026-10-10: money has at most two decimal places.
describe('ReceiveDueModal, decimals', () => {
  it('refuses a third decimal beside the field and keeps the button off', () => {
    open()
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '12.345' } })
    expect(screen.getByLabelText(/Amount/)).toHaveAccessibleDescription('Amounts have at most two decimal places.')
    expect(submit()).toBeDisabled()
  })

  it('accepts a trailing zero', () => {
    open()
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '12.340' } })
    expect(screen.getByLabelText(/Amount/)).not.toHaveAttribute('aria-invalid', 'true')
    expect(submit()).toBeEnabled()
  })

  it('shows the server’s message for the amount on the field', () => {
    vi.mocked(useReceiveCommissionDue).mockReturnValue(
      mutation(
        new ApiError(
          'x',
          { error: { code: 'validation_failed', message: 'Check the form.', details: { fields: { amount: 'Amounts have at most two decimal places.' } } } },
          400,
        ),
      ),
    )
    open()
    expect(screen.getByLabelText(/Amount/)).toHaveAccessibleDescription('Amounts have at most two decimal places.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// Phase 8 T4-10: the box offers only the currencies that have an exchange rate today, and prints
// the rate as the server rounded it for showing.
describe('ReceiveDueModal, currencies with a rate', () => {
  const optionsOf = (label: string) =>
    Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((o) => o.value)

  it('offers only the currencies the server says have a rate', () => {
    vi.mocked(useReceivePreview).mockReturnValue(previewAnswer({ currencies_with_rate: ['CAD', 'GBP', 'INR'] }))
    open(caseRow(['CAD', 'USD']))
    expect(optionsOf('Currency')).toEqual(['CAD', 'GBP', 'INR'])
  })

  it('moves the picker off a currency that is not on the list', () => {
    vi.mocked(useReceivePreview).mockReturnValue(previewAnswer({ currencies_with_rate: ['GBP', 'INR'] }))
    open(caseRow(['CAD']))
    expect((screen.getByLabelText('Currency') as HTMLSelectElement).value).toBe('GBP')
  })

  it('lists the case’s currencies and the common codes until the server has answered', () => {
    open(caseRow(['CAD']))
    expect(optionsOf('Currency')).toContain('USD')
  })

  it('prints rate_display as served, not the full rate', async () => {
    vi.mocked(useReceivePreview).mockReturnValue(
      previewAnswer({
        currency: 'INR',
        owed_currency: 'CAD',
        amount: { amount: 1000, currency: 'INR' },
        settles: { amount: 14.4, currency: 'CAD' },
        rate: 0.014400921658986175,
        rate_display: 0.0144,
      }),
    )
    open()
    tickOtherCurrency()
    fireEvent.change(screen.getByLabelText(/Amount received/), { target: { value: '1000' } })
    expect(await screen.findByText(/\(1 INR = 0\.0144 CAD\)/)).toBeInTheDocument()
  })
})

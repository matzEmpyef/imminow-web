import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The operator decides what goes with a moved case (owner's ruling on review I-014, 2026-10-08):
// the same four tick boxes as a consultancy's own transfer, and the answer says what was shared.
vi.mock('@/lib/currencies', () => ({ useCurrencyCodes: () => ['GBP', 'INR'] }))
vi.mock('@/queries/supportTools', () => ({ useSwitchCandidates: vi.fn(), useSwitchConsultancy: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useSwitchCandidates, useSwitchConsultancy } from '@/queries/supportTools'
import { SwitchConsultancyForm } from './SwitchConsultancyForm'

const mutate = vi.fn()

const candidate = (id: string, name: string, blocked: string | null = null) => ({
  consultancy_id: id,
  name,
  city: 'Pune',
  serves_countries: [],
  active_applicants: 3,
  seats_used: 2,
  seat_limit: 5,
  blocked_reason: blocked,
})

function mutation(error: Error | null = null) {
  return { mutate, isPending: false, isError: Boolean(error), error } as never
}

function openConfirm() {
  render(
    <MemoryRouter>
      <SwitchConsultancyForm result={{ name: 'Asha Nair', journey_id: 'j1' } as never} onCancel={() => {}} />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText('Beta Consult'))
  fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Asked to move' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

// The candidates read says whether a college has accepted the student and whether money is
// recorded on that admission (`has_accepted_college`, `has_recorded_payments`); nothing else is read.
function serve(flags: { has_accepted_college?: boolean; has_recorded_payments?: boolean } = {}) {
  vi.mocked(useSwitchCandidates).mockReturnValue({
    data: {
      items: [candidate('a', 'Alpha Consult', 'current_consultancy'), candidate('b', 'Beta Consult')],
      has_accepted_college: false,
      has_recorded_payments: false,
      ...flags,
    },
    isLoading: false,
    isError: false,
  } as never)
}

/** The Accept popup's fields for the moved admission: a college amount and currency, a start month. */
function fillAmounts() {
  fireEvent.change(screen.getByLabelText(/From college/), { target: { value: '1200.50' } })
  const currencies = screen.getAllByLabelText(/^Currency/)
  fireEvent.change(currencies[0], { target: { value: 'GBP' } })
  fireEvent.change(screen.getByLabelText(/Course starts/), { target: { value: 'September' } })
}

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useSwitchConsultancy).mockReturnValue(mutation())
  serve()
})

describe('Switch consultancy — what moves with the case', () => {
  it('sends all four keys, documents only unless changed', () => {
    openConfirm()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))
    expect(mutate.mock.calls[0][0]).toEqual({
      journeyId: 'j1',
      new_consultancy_id: 'b',
      reason: 'Asked to move',
      carry: { documents: true, applications: false, preferences: false, chat: false, admission: false, recorded_payments: false },
    })
  })

  it('sends what was ticked and then says what the server shared', () => {
    openConfirm()
    fireEvent.click(screen.getByRole('checkbox', { name: /Case preferences/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))
    expect(mutate.mock.calls[0][0].carry).toEqual({
      documents: true,
      applications: false,
      preferences: true,
      chat: false,
      admission: false,
      recorded_payments: false,
    })

    act(() => mutate.mock.calls[0][1].onSuccess({ ok: true, client_id: 'new-1', carried: ['documents', 'preferences'] }))
    expect(screen.getByText('Moved. Shared: documents, case preferences.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the new case' })).toHaveAttribute('href', '/admin/applicants/new-1')
  })

  it('says so when nothing was shared', () => {
    openConfirm()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))
    act(() => mutate.mock.calls[0][1].onSuccess({ ok: true, client_id: 'new-1', carried: [] }))
    expect(screen.getByText('Moved. Nothing was shared.')).toBeInTheDocument()
  })

  it('shows the server’s sentence when it refuses', () => {
    vi.mocked(useSwitchConsultancy).mockReturnValue(
      mutation(new ApiError('x', { error: { code: 'validation_failed', message: 'carry must be an object of true/false values.' } }, 400)),
    )
    openConfirm()
    expect(screen.getByText('carry must be an object of true/false values.')).toBeInTheDocument()
  })
})

// DECISIONS 117 C-9 and 118: when a college has accepted the student, the operator also says
// whether the admission goes to the new consultancy. No unless they say Yes.
describe('Switch consultancy — the admission question', () => {
  it('is not asked when no college has accepted the student', () => {
    openConfirm()
    expect(screen.queryByText('Does the admission go to the new consultancy too?')).not.toBeInTheDocument()
  })

  it('is asked with No chosen, explains No, and sends admission false unless Yes is chosen', () => {
    serve({ has_accepted_college: true })
    openConfirm()
    expect(screen.getByText('Does the admission go to the new consultancy too?')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Yes' })).not.toBeChecked()
    expect(screen.getByText("The accepted college stays with the first consultancy, and immiNow's share of that admission becomes due from it now.")).toBeInTheDocument()
    expect(screen.queryByLabelText(/From college/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))
    expect(mutate.mock.calls[0][0].carry.admission).toBe(false)
    expect(mutate.mock.calls[0][0].admission_commission).toBeUndefined()
  })
})

// DECISIONS 147a: while the admission goes, Support enters the amounts for the new consultancy —
// the Accept popup's fields — and they are sent as `admission_commission`.
describe('Switch consultancy — the amounts for a moved admission', () => {
  it('shows the Accept popup fields after Yes and lists what is still needed', () => {
    serve({ has_accepted_college: true })
    openConfirm()
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(screen.getByLabelText(/From college/)).toBeInTheDocument()
    expect(screen.getByLabelText(/From student/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Course starts/)).toBeInTheDocument()
    expect(screen.getByText('Still needed: an amount from the college or the student, the month the course starts.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm switch' })).toBeDisabled()
  })

  it('sends the amounts as admission_commission with admission true, then the line goes', () => {
    serve({ has_accepted_college: true })
    openConfirm()
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    fillAmounts()
    expect(screen.queryByText(/Still needed/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))
    expect(mutate.mock.calls[0][0].carry).toMatchObject({ admission: true, recorded_payments: false })
    expect(mutate.mock.calls[0][0].admission_commission).toEqual({
      expected_from_college: { amount: 1200.5, currency: 'GBP' },
      course_start: { month: 'September', year: new Date().getFullYear() },
    })
  })

  it('asks for the currency of an amount that has none', () => {
    serve({ has_accepted_college: true })
    openConfirm()
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    fireEvent.change(screen.getByLabelText(/From student/), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText(/Course starts/), { target: { value: 'January' } })
    expect(screen.getByText('Still needed: the currency of the student amount.')).toBeInTheDocument()
  })

  it('sends no amounts when the admission stays', () => {
    serve({ has_accepted_college: true })
    openConfirm()
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    fillAmounts()
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))
    expect(mutate.mock.calls[0][0].carry.admission).toBe(false)
    expect(mutate.mock.calls[0][0].admission_commission).toBeUndefined()
  })

  it('shows the served sentence for missing amounts beside the fields, once', () => {
    const refusal =
      'Enter the amounts agreed with Beta Consult for this admission (what the student pays and what the college pays), as when accepting a college, or move the student without the admission.'
    serve({ has_accepted_college: true })
    vi.mocked(useSwitchConsultancy).mockReturnValue(
      mutation(new ApiError('x', { error: { code: 'validation_failed', message: refusal, details: { fields: { admission_commission: refusal } } } }, 422)),
    )
    openConfirm()
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(screen.getAllByText(refusal)).toHaveLength(1)
  })

  it.each([
    [
      'not_a_partner_college',
      "Aston College is not one of Beta Consult's Partner Colleges, so the admission cannot move with the student. Add it to their Partner Colleges first, or move the student without the admission.",
    ],
    [
      'admission_cannot_move',
      'immiNow Finance has changed what is owed on this admission, so it cannot move with the student. Ask Finance to undo the change first, or move the student without the admission.',
    ],
  ])('shows the %s refusal exactly as served', (code, message) => {
    serve({ has_accepted_college: true })
    vi.mocked(useSwitchConsultancy).mockReturnValue(
      mutation(new ApiError('x', { error: { code, message, details: { fields: { admission_commission: message } } } }, 409)),
    )
    openConfirm()
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(screen.getAllByText(message)).toHaveLength(1)
  })
})

// The money already recorded on the admission is a second question, asked only after Yes, and only
// when the candidates read says money is recorded (`has_recorded_payments`).
describe('Switch consultancy — the recorded money question', () => {
  it('asks it after Yes, sends recorded_payments true when Yes is chosen, and names both in the confirmation', () => {
    serve({ has_accepted_college: true, has_recorded_payments: true })
    openConfirm()
    expect(screen.queryByText('Does the money already recorded on this admission go too?')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('radio', { name: 'Yes' })[0])
    fireEvent.click(screen.getAllByRole('radio', { name: 'Yes' })[1])
    fillAmounts()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))
    expect(mutate.mock.calls[0][0].carry).toMatchObject({ admission: true, recorded_payments: true })
    act(() => {
      mutate.mock.calls[0][1].onSuccess({ client_id: 'n1', carried: ['documents', 'admission', 'recorded_payments'] })
    })
    expect(screen.getByText('Moved. Shared: documents, accepted college, recorded payments.')).toBeInTheDocument()
  })

  it('sends recorded_payments false when the admission stays', () => {
    serve({ has_accepted_college: true, has_recorded_payments: true })
    openConfirm()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))
    expect(mutate.mock.calls[0][0].carry).toMatchObject({ admission: false, recorded_payments: false })
  })

  it('sends recorded_payments false when the money was chosen and the admission is then set back to No', () => {
    serve({ has_accepted_college: true, has_recorded_payments: true })
    openConfirm()
    fireEvent.click(screen.getAllByRole('radio', { name: 'Yes' })[0])
    fireEvent.click(screen.getAllByRole('radio', { name: 'Yes' })[1])
    fireEvent.click(screen.getAllByRole('radio', { name: 'No' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))
    expect(mutate.mock.calls[0][0].carry).toMatchObject({ admission: false, recorded_payments: false })
  })

  it('does not ask it when the server says no payments are recorded', () => {
    serve({ has_accepted_college: true, has_recorded_payments: false })
    openConfirm()
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(screen.queryByText('Does the money already recorded on this admission go too?')).not.toBeInTheDocument()
  })

  it('does not ask either question from has_recorded_payments alone', () => {
    serve({ has_accepted_college: false, has_recorded_payments: true })
    openConfirm()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })
})

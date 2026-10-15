import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The operator decides what goes with a moved case (owner's ruling on review I-014, 2026-10-08):
// the same four tick boxes as a consultancy's own transfer, and the answer says what was shared.
vi.mock('@/queries/supportTools', () => ({ useSwitchCandidates: vi.fn(), useSwitchConsultancy: vi.fn() }))
vi.mock('@/queries/applicantCase', () => ({ useCarryQuestions: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useCarryQuestions } from '@/queries/applicantCase'
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

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useSwitchConsultancy).mockReturnValue(mutation())
  vi.mocked(useCarryQuestions).mockReturnValue({ admission: false, payments: false })
  vi.mocked(useSwitchCandidates).mockReturnValue({
    data: { items: [candidate('a', 'Alpha Consult', 'current_consultancy'), candidate('b', 'Beta Consult')] },
    isLoading: false,
    isError: false,
  } as never)
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
    vi.mocked(useCarryQuestions).mockReturnValue({ admission: true, payments: false })
    openConfirm()
    expect(screen.getByText('Does the admission go to the new consultancy too?')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Yes' })).not.toBeChecked()
    expect(screen.getByText("The accepted college stays with the first consultancy, and immiNow's share of that admission becomes due from it now.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))
    expect(mutate.mock.calls[0][0].carry.admission).toBe(false)
  })

  it('sends admission true when Yes is chosen', () => {
    vi.mocked(useCarryQuestions).mockReturnValue({ admission: true, payments: false })
    openConfirm()
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))
    expect(mutate.mock.calls[0][0].carry.admission).toBe(true)
  })
})

// The money already recorded on the admission is a second question, asked only after Yes.
describe('Switch consultancy — the recorded money question', () => {
  it('asks it after Yes, sends recorded_payments true when Yes is chosen, and names both in the confirmation', () => {
    vi.mocked(useCarryQuestions).mockReturnValue({ admission: true, payments: true })
    openConfirm()
    expect(screen.queryByText('Does the money already recorded on this admission go too?')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('radio', { name: 'Yes' })[0])
    fireEvent.click(screen.getAllByRole('radio', { name: 'Yes' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))
    expect(mutate.mock.calls[0][0].carry).toMatchObject({ admission: true, recorded_payments: true })
    act(() => {
      mutate.mock.calls[0][1].onSuccess({ client_id: 'n1', carried: ['documents', 'admission', 'recorded_payments'] })
    })
    expect(screen.getByText('Moved. Shared: documents, accepted college, recorded payments.')).toBeInTheDocument()
  })

  it('sends recorded_payments false when the admission stays', () => {
    vi.mocked(useCarryQuestions).mockReturnValue({ admission: true, payments: true })
    openConfirm()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))
    expect(mutate.mock.calls[0][0].carry).toMatchObject({ admission: false, recorded_payments: false })
  })

  it('does not ask it when the server says no payments are recorded', () => {
    vi.mocked(useCarryQuestions).mockReturnValue({ admission: true, payments: false })
    openConfirm()
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(screen.queryByText('Does the money already recorded on this admission go too?')).not.toBeInTheDocument()
  })

  it('shows a served refusal exactly as served, beside the form', () => {
    const refusal = 'The money cannot go: payments to immiNow were already made on this admission.'
    vi.mocked(useCarryQuestions).mockReturnValue({ admission: true, payments: true })
    vi.mocked(useSwitchConsultancy).mockReturnValue(mutation(new ApiError('x', { error: { code: 'conflict', message: refusal } }, 409)))
    openConfirm()
    expect(screen.getByText(refusal)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm switch' })).toBeInTheDocument()
  })

  it('shows the refusal for a college that is not a Partner College of the new consultancy', () => {
    const refusal = 'The admission cannot go: this college is not a Partner College of Beta Consult.'
    vi.mocked(useCarryQuestions).mockReturnValue({ admission: true, payments: false })
    vi.mocked(useSwitchConsultancy).mockReturnValue(mutation(new ApiError('x', { error: { code: 'conflict', message: refusal } }, 409)))
    openConfirm()
    expect(screen.getByText(refusal)).toBeInTheDocument()
  })
})

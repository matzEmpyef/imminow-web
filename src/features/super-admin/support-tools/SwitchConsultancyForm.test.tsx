import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The operator decides what goes with a moved case (owner's ruling on review I-014, 2026-10-08):
// the same four tick boxes as a consultancy's own transfer, and the answer says what was shared.
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

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useSwitchConsultancy).mockReturnValue(mutation())
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
      carry: { documents: true, applications: false, preferences: false, chat: false },
    })
  })

  it('sends what was ticked and then says what the server shared', () => {
    openConfirm()
    fireEvent.click(screen.getByRole('checkbox', { name: /Case preferences/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))
    expect(mutate.mock.calls[0][0].carry).toEqual({ documents: true, applications: false, preferences: true, chat: false })

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

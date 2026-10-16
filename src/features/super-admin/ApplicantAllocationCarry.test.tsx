import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Allocating a consultancy-change row moves a case, so the operator chooses what goes with it
// (owner's ruling on review I-014, 2026-10-08). A freelancer referral opens a first case: there
// is nothing to carry, no boxes are shown and no `carry` is sent.
vi.mock('@/features/auth/AdminShell', () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/queries/applicantAllocation', () => ({
  useApplicantAllocationQueue: vi.fn(),
  useAllocateApplicant: vi.fn(),
  useAllocationCandidates: vi.fn(),
  useResolveAllocationRequest: vi.fn(),
}))
vi.mock('@/lib/currencies', () => ({ useCurrencyCodes: () => ['GBP', 'INR'] }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/components/SearchSelect', () => ({
  SearchSelect: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange('acc-2')}>
      Pick consultancy
    </button>
  ),
}))

import { ApiError } from '@/api/errors'
import {
  useAllocateApplicant,
  useAllocationCandidates,
  useApplicantAllocationQueue,
  useResolveAllocationRequest,
} from '@/queries/applicantAllocation'
import { showToast } from '@/lib/toast'
import { ApplicantAllocationPage } from './ApplicantAllocationPage'

const mutate = vi.fn()

const changeRow = {
  id: 'q1',
  applicant_name: 'Asha Nair',
  source: 'complaint',
  reason: 'consultancy_change',
  current_consultancy_name: 'Alpha Consult',
  created_at: '2026-10-07T09:00:00Z',
}
const freelancerRow = {
  id: 'q2',
  applicant_name: 'Zoya Khan',
  source: 'freelancer_signup',
  reason: 'freelancer_sourced',
  freelancer_name: 'Ravi',
  created_at: '2026-10-07T09:00:00Z',
}

function openAllocate(row: Record<string, unknown>) {
  vi.mocked(useApplicantAllocationQueue).mockReturnValue({ data: { items: [row] }, isLoading: false, isError: false } as never)
  render(
    <MemoryRouter>
      <ApplicantAllocationPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: `Allocate ${row.applicant_name as string}` }))
  fireEvent.click(screen.getByRole('button', { name: 'Pick consultancy' }))
}

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(showToast).mockClear()
  vi.mocked(useAllocateApplicant).mockReturnValue({ mutate, isPending: false, isError: false, error: null } as never)
  vi.mocked(useAllocationCandidates).mockReturnValue({ data: [], isLoading: false, isError: false } as never)
  vi.mocked(useResolveAllocationRequest).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
})

describe('Applicant Allocation — what moves with the case', () => {
  it('a consultancy change: shows the boxes, sends all four keys and says what was shared', () => {
    openAllocate(changeRow)
    expect(screen.getByRole('checkbox', { name: /Documents/ })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: /College applications/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Allocate' }))

    expect(mutate.mock.calls[0][0]).toEqual({
      consultancyId: 'acc-2',
      carry: { documents: true, applications: true, preferences: false, chat: false, admission: false, recorded_payments: false },
    })
    mutate.mock.calls[0][1].onSuccess({ ok: true, client_id: 'n1', carried: ['documents', 'applications'] })
    expect(showToast).toHaveBeenCalledWith('Moved. Shared: documents, college applications.')
  })

  // The row says whether a college has accepted the student and whether money is recorded on the
  // admission (`has_accepted_college`, `has_recorded_payments`); nothing more is read.
  const acceptedRow = { ...changeRow, journey_id: 'j1', has_accepted_college: true, has_recorded_payments: false }

  function fillAmounts() {
    fireEvent.change(screen.getByLabelText(/From student/), { target: { value: '800' } })
    fireEvent.change(screen.getAllByLabelText(/^Currency/)[1], { target: { value: 'GBP' } })
    fireEvent.change(screen.getByLabelText(/Course starts/), { target: { value: 'January' } })
  }

  it('asks whether the admission goes too when a college has accepted the student, and sends the answer with the amounts', () => {
    openAllocate(acceptedRow)
    expect(screen.getByText('Does the admission go to the new consultancy too?')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(screen.getByRole('button', { name: 'Allocate' })).toBeDisabled()
    expect(screen.getByText('Still needed: an amount from the college or the student, the month the course starts.')).toBeInTheDocument()
    fillAmounts()
    fireEvent.click(screen.getByRole('button', { name: 'Allocate' }))
    expect(mutate.mock.calls[0][0].carry.admission).toBe(true)
    expect(mutate.mock.calls[0][0].admission_commission).toEqual({
      expected_from_student: { amount: 800, currency: 'GBP' },
      course_start: { month: 'January', year: new Date().getFullYear() },
    })
  })

  it('sends no amounts when the admission stays', () => {
    openAllocate(acceptedRow)
    fireEvent.click(screen.getByRole('button', { name: 'Allocate' }))
    expect(mutate.mock.calls[0][0].carry.admission).toBe(false)
    expect(mutate.mock.calls[0][0].admission_commission).toBeUndefined()
  })

  it('asks about the recorded money after Yes, sends it, and names it in the confirmation', () => {
    openAllocate({ ...acceptedRow, has_recorded_payments: true })
    expect(screen.queryByText('Does the money already recorded on this admission go too?')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('radio', { name: 'Yes' })[0])
    fireEvent.click(screen.getAllByRole('radio', { name: 'Yes' })[1])
    fillAmounts()
    fireEvent.click(screen.getByRole('button', { name: 'Allocate' }))
    expect(mutate.mock.calls[0][0].carry).toMatchObject({ admission: true, recorded_payments: true })
    mutate.mock.calls[0][1].onSuccess({ ok: true, client_id: 'n1', carried: ['documents', 'admission', 'recorded_payments'] })
    expect(showToast).toHaveBeenCalledWith('Moved. Shared: documents, accepted college, recorded payments.')
  })

  it('does not ask about the money when nothing is recorded on the admission', () => {
    openAllocate(acceptedRow)
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(screen.queryByText('Does the money already recorded on this admission go too?')).not.toBeInTheDocument()
  })

  it('shows a served refusal of the admission exactly as served, beside the amounts and only once', () => {
    const refusal =
      "Aston College is not one of Beta Consult's Partner Colleges, so the admission cannot move with the student. Add it to their Partner Colleges first, or move the student without the admission."
    vi.mocked(useAllocateApplicant).mockReturnValue({
      mutate,
      isPending: false,
      isError: true,
      error: new ApiError('x', { error: { code: 'not_a_partner_college', message: refusal, details: { fields: { admission_commission: refusal } } } }, 409),
    } as never)
    openAllocate(acceptedRow)
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(screen.getAllByText(refusal)).toHaveLength(1)
  })

  it('shows any other refusal in the footer, exactly as served', () => {
    const refusal = 'That consultancy has no active staff.'
    vi.mocked(useAllocateApplicant).mockReturnValue({
      mutate,
      isPending: false,
      isError: true,
      error: new ApiError('x', { error: { code: 'no_active_staff', message: refusal } }, 409),
    } as never)
    openAllocate(changeRow)
    expect(screen.getByText(refusal)).toBeInTheDocument()
  })

  it('does not ask it on a change row whose case has no accepted college', () => {
    openAllocate({ ...changeRow, journey_id: 'j1' })
    expect(screen.queryByText('Does the admission go to the new consultancy too?')).not.toBeInTheDocument()
  })

  it('a freelancer referral: no boxes, and no carry is sent', () => {
    openAllocate(freelancerRow)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText('What moves with the case')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Allocate' }))

    expect(mutate.mock.calls[0][0]).toEqual({ consultancyId: 'acc-2', carry: undefined })
    mutate.mock.calls[0][1].onSuccess({ ok: true, client_id: 'n2' })
    expect(showToast).toHaveBeenCalledWith('Zoya Khan allocated')
  })
})

function showQueue(row: Record<string, unknown>) {
  vi.mocked(useApplicantAllocationQueue).mockReturnValue({ data: { items: [row] }, isLoading: false, isError: false } as never)
  render(
    <MemoryRouter>
      <ApplicantAllocationPage />
    </MemoryRouter>,
  )
}

// Review F-268: the complaint's text is served to holders of the Support permission only. The row
// still carries the complaint, so it says where the text can be read.
describe('Applicant Allocation — the complaint behind a change request', () => {
  const SUPPORT_ONLY = 'Complaint text is visible to Support staff.'

  it('shows the text to someone who is sent it', () => {
    showQueue({ ...changeRow, complaint_id: 'cmp-1', complaint_description: 'They never call back.' })
    expect(screen.getByText('“They never call back.”')).toBeInTheDocument()
    expect(screen.queryByText(SUPPORT_ONLY)).not.toBeInTheDocument()
  })

  it('says who can read it when the text is left out', () => {
    showQueue({ ...changeRow, complaint_id: 'cmp-1', complaint_category: 'communication' })
    expect(screen.getByText(SUPPORT_ONLY)).toBeInTheDocument()
  })

  it('says nothing about a complaint on a row that has none', () => {
    showQueue(freelancerRow)
    expect(screen.queryByText(SUPPORT_ONLY)).not.toBeInTheDocument()
  })
})

// Review F-264: the note is filed behind the server's own lead-in, which leaves 1,971 characters.
describe('Applicant Allocation — declining a change request', () => {
  it('stops the note at 1,971 characters', () => {
    showQueue({ ...changeRow, complaint_id: 'cmp-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Decline the transfer request from Asha Nair' }))
    const note = screen.getByLabelText(/Why are you declining the transfer/) as HTMLTextAreaElement
    fireEvent.change(note, { target: { value: 'x'.repeat(2500) } })
    expect(note.value).toHaveLength(1971)
  })

  // Review 2.113: the cap was silent. Decision 154: the count and the limit sit under the box from 90%.
  it('shows how much of the 1,971 characters the note has used once it nears the limit', () => {
    showQueue({ ...changeRow, complaint_id: 'cmp-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Decline the transfer request from Asha Nair' }))
    const note = screen.getByLabelText(/Why are you declining the transfer/)
    fireEvent.change(note, { target: { value: 'Not eligible' } })
    expect(screen.queryByText('12 / 1971')).toBeNull()
    fireEvent.change(note, { target: { value: 'x'.repeat(1800) } })
    expect(screen.getByText('1800 / 1971')).toBeInTheDocument()
  })

  it("shows the server's sentence against the note if it still refuses", () => {
    vi.mocked(useResolveAllocationRequest).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: true,
      error: new Error('That note is too long.'),
    } as never)
    showQueue({ ...changeRow, complaint_id: 'cmp-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Decline the transfer request from Asha Nair' }))
    expect(screen.getByText('That note is too long.')).toBeInTheDocument()
  })
})

// DECISIONS 128(a): a consultancy at its seat limit can be given a student, so only the four
// reasons the server still sends are named. "No active staff" is kept.
describe('Applicant Allocation — consultancies that are not offered', () => {
  it('names the reasons the server still sends, in plain words', () => {
    vi.mocked(useAllocationCandidates).mockReturnValue({
      data: [
        { consultancy_id: 'c1', name: 'Gamma Consult', blocked_reason: 'no_active_staff', serves_countries: [], active_applicants: 0, seats_used: 0, seat_limit: 5 },
        { consultancy_id: 'c2', name: 'Delta Consult', blocked_reason: 'subscription_lapsed', serves_countries: [], active_applicants: 0, seats_used: 1, seat_limit: 5 },
      ],
      isLoading: false,
      isError: false,
    } as never)
    openAllocate(changeRow)
    expect(screen.getByText(/No active staff \(1\): Gamma Consult/)).toBeInTheDocument()
    expect(screen.getByText(/Subscription lapsed \(1\): Delta Consult/)).toBeInTheDocument()
    expect(screen.queryByText(/No seat left/)).not.toBeInTheDocument()
  })
})


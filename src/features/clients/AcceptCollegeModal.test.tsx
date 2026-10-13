import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-300: the "From college" suggestion is the server's figure (fee x percent / 100 at two
// decimals). The dialog multiplies and rounds nothing; it shows what is served, leaves the box empty
// when the server offers nothing, and never overwrites a figure the consultant has typed.
vi.mock('@/queries/clients', () => ({ useUpdateApplication: vi.fn(), useCommissionSuggestion: vi.fn() }))
vi.mock('@/queries/partnerColleges', () => ({ usePartnerColleges: vi.fn() }))
vi.mock('@/lib/currencies', () => ({ useCurrencyCodes: () => ['CAD', 'USD'] }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: () => ({ isInstitute: false }) }))
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))

import { useCommissionSuggestion, useUpdateApplication } from '@/queries/clients'
import { usePartnerColleges } from '@/queries/partnerColleges'
import { AcceptCollegeModal } from './AcceptCollegeModal'

const mutate = vi.fn()

const row = {
  id: 'a1',
  course: {
    id: 'c1',
    name: 'MSc Data Science',
    college_id: 'col1',
    college_name: 'Northern College',
    fee: { amount: 33333, currency: 'CAD' },
    intakes: ['September'],
  },
} as never

function suggestion(data: unknown) {
  return { data, error: null, isFetching: false } as never
}

const served = {
  expected_from_college: { amount: 3999.96, currency: 'CAD' },
  fee: { amount: 33333, currency: 'CAD' },
  commission_percent: 12,
}

function open() {
  return render(<AcceptCollegeModal clientId="cl1" row={row} journeyPayerMethod="college" onClose={() => {}} />)
}

const collegeBox = () => screen.getByLabelText(/From college/) as HTMLInputElement

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useUpdateApplication).mockReturnValue({ mutate, isPending: false, isError: false, error: null } as never)
  vi.mocked(usePartnerColleges).mockReturnValue({
    data: [{ college_id: 'col1', active: true, commission_percent: 12, payer_method: 'college' }],
  } as never)
  vi.mocked(useCommissionSuggestion).mockReset()
  vi.mocked(useCommissionSuggestion).mockReturnValue(suggestion(served))
})

describe('AcceptCollegeModal, the suggested commission', () => {
  it('asks the server for this case and course, and only when the college pays', () => {
    open()
    expect(vi.mocked(useCommissionSuggestion).mock.calls[0]).toEqual(['cl1', 'c1', true])
  })

  it('prefills from the figure the server gives, as served and at two decimals', () => {
    open()
    expect(collegeBox().value).toBe('3999.96')
  })

  it('does not round or work out anything: the served figure is the box, whatever the fee and percent say', () => {
    vi.mocked(useCommissionSuggestion).mockReturnValue(
      suggestion({ ...served, expected_from_college: { amount: 1, currency: 'CAD' } }),
    )
    open()
    expect(collegeBox().value).toBe('1.00')
  })

  it('prefills nothing when the server offers nothing, and does not block typing', () => {
    vi.mocked(useCommissionSuggestion).mockReturnValue(
      suggestion({ expected_from_college: null, fee: null, commission_percent: null }),
    )
    open()
    expect(collegeBox().value).toBe('')
    fireEvent.change(collegeBox(), { target: { value: '500' } })
    expect(collegeBox().value).toBe('500')
  })

  it('shows how it was reached from the served fee and percent', () => {
    open()
    expect(screen.getByText(/12% of the CAD 33,333\.00 tuition/)).toBeInTheDocument()
  })

  it('does not overwrite a figure the consultant typed when the suggestion arrives late', () => {
    vi.mocked(useCommissionSuggestion).mockReturnValue(suggestion(undefined))
    const view = open()
    fireEvent.change(collegeBox(), { target: { value: '750' } })
    vi.mocked(useCommissionSuggestion).mockReturnValue(suggestion(served))
    view.rerender(<AcceptCollegeModal clientId="cl1" row={row} journeyPayerMethod="college" onClose={() => {}} />)
    expect(collegeBox().value).toBe('750')
  })

  it('fills the box when the suggestion arrives and nothing has been typed', () => {
    vi.mocked(useCommissionSuggestion).mockReturnValue(suggestion(undefined))
    const view = open()
    expect(collegeBox().value).toBe('')
    vi.mocked(useCommissionSuggestion).mockReturnValue(suggestion(served))
    view.rerender(<AcceptCollegeModal clientId="cl1" row={row} journeyPayerMethod="college" onClose={() => {}} />)
    expect(collegeBox().value).toBe('3999.96')
  })

  it('sends what is in the box on acceptance, which is the consultant’s to change', () => {
    open()
    fireEvent.change(collegeBox(), { target: { value: '4100.5' } })
    fireEvent.change(screen.getByLabelText(/Start/i, { selector: 'select' }), { target: { value: 'September' } })
    fireEvent.click(screen.getByRole('button', { name: /Accept/ }))
    expect(mutate.mock.calls[0][0]).toMatchObject({
      applicationId: 'a1',
      status: 'accepted',
      commission: { expected_from_college: { amount: 4100.5, currency: 'CAD' } },
    })
  })
})

// T4-19: the server refuses an acceptance from a college that is not a Partner College. The box
// says so at the top, with the way to Partner Colleges, instead of at the last click.
describe('AcceptCollegeModal, a college that is not a Partner College', () => {
  it('says so at the top, links to Partner Colleges and does not offer Accept', () => {
    vi.mocked(usePartnerColleges).mockReturnValue({
      data: [{ college_id: 'someone-else', active: true, commission_percent: 12, payer_method: 'college' }],
    } as never)
    open()
    expect(screen.getByText(/Northern College is not one of your Partner Colleges/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Partner Colleges' })).toHaveAttribute(
      'href',
      '/administration/consultancy-profile?tab=partner-colleges',
    )
    expect(screen.getByRole('button', { name: /Accept/ })).toBeDisabled()
  })
})

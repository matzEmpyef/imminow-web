import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

// T4-35: an application row has no stray separators when its campus or fee is missing. T4-19: a
// college that is not a Partner College says so on its row as soon as the offer is marked.
vi.mock('@/queries/clients', () => ({
  useClient: () => ({ data: { payer_method: 'college', student: { first_name: 'Aarav' } } }),
  useApplications: () => ({
    isLoading: false,
    data: [
      {
        id: 'a1',
        status: 'offer_received',
        campus: null,
        course: { id: 'c1', name: 'MSc Data', college_id: 'col1', college_name: 'Ironbridge Polytechnic', country: 'United Kingdom', fee: { currency: 'GBP', amount: 20400 } },
      },
    ],
  }),
  useUpdateApplication: () => ({ mutate: vi.fn(), isPending: false, isError: false, variables: undefined }),
}))
vi.mock('@/components/CountryLabel', () => ({
  CountryLabel: ({ name }: { name: string }) => <>{name}</>,
  CountryLabelList: ({ names }: { names: string[] }) => <>{names.join(', ')}</>,
}))
vi.mock('./AddApplicationModal', () => ({ AddApplicationModal: () => null }))
vi.mock('./AcceptCollegeModal', () => ({ AcceptCollegeModal: () => null }))
vi.mock('./RevertAcceptanceModal', () => ({ RevertAcceptanceModal: () => null }))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: () => ({ isInstitute: false }) }))
vi.mock('@/lib/me', () => ({ useMeStaff: () => null }))
vi.mock('@/queries/partnerColleges', () => ({ usePartnerColleges: () => ({ data: [] }) }))

import { ApplicationsTab } from './ClientProfileApplicationsTab'

describe('Applications row', () => {
  it('has no dot with nothing beside it when the campus is missing', () => {
    render(
      <MemoryRouter>
        <ApplicationsTab clientId="cl1" />
      </MemoryRouter>,
    )
    const line = screen.getByText(/Ironbridge Polytechnic ·/).closest('p')!
    expect(line.textContent).toBe('Ironbridge Polytechnic · United Kingdom · GBP 20,400.00')
  })

  it('warns that the college is not a Partner College as soon as the offer is marked', () => {
    render(
      <MemoryRouter>
        <ApplicationsTab clientId="cl1" />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Ironbridge Polytechnic is not one of your Partner Colleges/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Partner Colleges' })).toBeInTheDocument()
  })
})

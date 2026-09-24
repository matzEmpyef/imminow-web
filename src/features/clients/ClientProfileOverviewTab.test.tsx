import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Transfer's own 409 `case_has_accepted_college` (product owner 2026-09-24) — a college already
// accepted (or, for a PR case, a contribution already recorded) means there is money on the case,
// so Transfer disables itself with the server's own reason rather than waiting for the 409. Uses
// the same `case_summary.accepted`/`contribution_recorded` fields CloseClientModal already reads
// for its own "can this close as a success?" check.
//
// Everything not under test (tags/branch/plan/study-preference reads) is left to its real,
// un-mocked hooks inside a bare QueryClientProvider — `enabled: isAuthed` on every one of them
// keeps this from firing a real request with no auth token in the test store.
vi.mock('@/queries/clients', () => ({
  useClient: vi.fn(),
  useSetClientBranch: vi.fn(),
  useSetClientTags: vi.fn(),
  useSetFinalizedCountry: vi.fn(),
}))
vi.mock('@/queries/consultancy', () => ({ useMyConsultancy: vi.fn() }))
vi.mock('@/lib/features', () => ({ useFeature: vi.fn() }))
vi.mock('@/queries/staff', () => ({ useBranches: vi.fn(), useEmployees: vi.fn() }))
vi.mock('@/queries/tags', () => ({ useCreateTag: vi.fn(), useTags: vi.fn() }))
vi.mock('@/lib/permissions', () => ({ usePermission: vi.fn() }))
vi.mock('@/queries/plans', () => ({ usePlans: vi.fn(), useLinkedFormResponses: vi.fn() }))

import {
  useClient,
  useSetClientBranch,
  useSetClientTags,
  useSetFinalizedCountry,
} from '@/queries/clients'
import { useMyConsultancy } from '@/queries/consultancy'
import { useFeature } from '@/lib/features'
import { useBranches, useEmployees } from '@/queries/staff'
import { useCreateTag, useTags } from '@/queries/tags'
import { usePermission } from '@/lib/permissions'
import { usePlans, useLinkedFormResponses } from '@/queries/plans'
import { OverviewTab } from './ClientProfileOverviewTab'

const mockedClient = vi.mocked(useClient)
const mockedFeature = vi.mocked(useFeature)
const mockedPermission = vi.mocked(usePermission)
const mockedPlans = vi.mocked(usePlans)
const mockedLinkedForms = vi.mocked(useLinkedFormResponses)

function query<T>(data: T, overrides: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, refetch: vi.fn(), ...overrides } as never
}

function baseClient(overrides: Record<string, unknown> = {}) {
  return {
    student: { first_name: 'Aiko', last_name: 'Tanaka', email: 'aiko@example.com', phone: null },
    status: 'in_plan',
    case_type: 'student',
    finalized_country: null,
    residence_state: null,
    residence_country: null,
    assigned_employee_id: null,
    assigned_employee_name: null,
    branch_id: null,
    preferred_branch_name: null,
    tags: [],
    preferences: null,
    case_summary: { accepted: 0, contribution_recorded: false },
    ...overrides,
  }
}

function renderOverview(props: { readOnly?: boolean } = {}) {
  const queryClient = new QueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OverviewTab clientId="c1" onViewPlan={vi.fn()} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockedFeature.mockReturnValue(true) // applicant_transfer entitlement on
  mockedPermission.mockReturnValue(true) // clients.transfer_applicant / clients.assign_template
  mockedPlans.mockReturnValue(query({ items: [] }))
  mockedLinkedForms.mockReturnValue([] as never)
  vi.mocked(useSetClientBranch).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  vi.mocked(useSetClientTags).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  vi.mocked(useSetFinalizedCountry).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  vi.mocked(useMyConsultancy).mockReturnValue(query({ countries_served: [] }))
  vi.mocked(useBranches).mockReturnValue(query([]))
  vi.mocked(useEmployees).mockReturnValue(query({ items: [] }))
  vi.mocked(useCreateTag).mockReturnValue({ mutateAsync: vi.fn() } as never)
  vi.mocked(useTags).mockReturnValue(query([]))
})

describe('OverviewTab — Transfer disabled when the case has an accepted college', () => {
  it('disables Transfer with the server’s own reason once a college is accepted', () => {
    mockedClient.mockReturnValue(query(baseClient({ case_summary: { accepted: 1, contribution_recorded: false } })))
    renderOverview()

    const transfer = screen.getByRole('button', { name: 'Transfer applicant to another consultancy' })
    expect(transfer).toBeDisabled()
    expect(transfer).toHaveAttribute(
      'title',
      "This case has an accepted college, so it can't be transferred. Close the case or raise a dispute instead.",
    )
  })

  it('disables Transfer for a PR case once its contribution is recorded', () => {
    mockedClient.mockReturnValue(
      query(baseClient({ case_type: 'pr', case_summary: { accepted: 0, contribution_recorded: true } })),
    )
    renderOverview()

    expect(screen.getByRole('button', { name: 'Transfer applicant to another consultancy' })).toBeDisabled()
  })

  it('leaves Transfer enabled when nothing has been accepted yet', () => {
    mockedClient.mockReturnValue(query(baseClient()))
    renderOverview()

    expect(screen.getByRole('button', { name: 'Transfer applicant to another consultancy' })).not.toBeDisabled()
  })

  it('hides Transfer outright once the case has already moved — nothing left to press', () => {
    mockedClient.mockReturnValue(query(baseClient({ status: 'closed_switched' })))
    renderOverview({ readOnly: true })

    expect(screen.queryByRole('button', { name: 'Transfer applicant to another consultancy' })).not.toBeInTheDocument()
  })

  it('disables the country/tags controls with the moved reason when readOnly', () => {
    mockedClient.mockReturnValue(query(baseClient({ status: 'closed_switched' })))
    renderOverview({ readOnly: true })

    expect(screen.getByLabelText('Country finalized to apply')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit tags for Aiko Tanaka' })).toBeDisabled()
  })
})

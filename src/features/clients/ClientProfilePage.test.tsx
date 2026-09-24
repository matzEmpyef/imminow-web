import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Case-moved read-only state (product owner 2026-09-24): a `closed_switched` case moved to
// another consultancy, so the profile page shows one banner near the top instead of re-explaining
// itself on every disabled control below, and the header actions that would now 409 `case_moved`
// (Raise an Issue, Close Case, Reopen Case/Plan, Transfer) disappear outright — the same "say why
// instead of greying out" idiom the header already uses for `in_dispute`.
//
// AppShell and every tab are stubbed so this test is only about the header/banner logic, not each
// tab's own data-fetching — the tabs get their own read-only tests.
vi.mock('@/features/auth/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('./ClientProfileOverviewTab', () => ({
  OverviewTab: (props: { readOnly?: boolean }) => <div data-testid="overview-tab" data-readonly={String(!!props.readOnly)} />,
}))
vi.mock('./ClientProfilePlanTab', () => ({ PlanTab: () => null }))
vi.mock('./ClientProfileCommissionsTab', () => ({ CommissionsTab: () => null }))
vi.mock('./ClientProfileApplicationsTab', () => ({ ApplicationsTab: () => null }))
vi.mock('./ClientProfileDocumentsTab', () => ({ DocumentsTab: () => null }))
vi.mock('./ClientProfileInternalNotesTab', () => ({ InternalNotesTab: () => null }))
vi.mock('./ClientProfileActivityTab', () => ({ ActivityTab: () => null }))
vi.mock('./ClientProfileFormsTab', () => ({ FormsTab: () => null }))
vi.mock('@/queries/clients', () => ({ useClient: vi.fn(), useReopenPlan: vi.fn() }))
vi.mock('@/queries/plans', () => ({ usePlans: vi.fn() }))
vi.mock('@/lib/features', () => ({ useFeature: vi.fn() }))
vi.mock('@/lib/permissions', () => ({ usePermission: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { useClient, useReopenPlan } from '@/queries/clients'
import { usePlans } from '@/queries/plans'
import { useFeature } from '@/lib/features'
import { usePermission } from '@/lib/permissions'
import { ClientProfilePage } from './ClientProfilePage'

const mockedClient = vi.mocked(useClient)
const mockedReopenPlan = vi.mocked(useReopenPlan)
const mockedPlans = vi.mocked(usePlans)
const mockedFeature = vi.mocked(useFeature)
const mockedPermission = vi.mocked(usePermission)

function query<T>(data: T, overrides: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, refetch: vi.fn(), ...overrides } as never
}

function baseClient(overrides: Record<string, unknown> = {}) {
  return {
    student: { first_name: 'Aiko', last_name: 'Tanaka' },
    file_number: 'STP0000042',
    status: 'in_plan',
    case_type: 'student',
    outcome: null,
    is_returning: false,
    previous_journey_id: null,
    closed_at: null,
    ...overrides,
  }
}

function renderProfile() {
  render(
    <MemoryRouter initialEntries={['/clients/c1']}>
      <Routes>
        <Route path="/clients/:id" element={<ClientProfilePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockedReopenPlan.mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  mockedPlans.mockReturnValue(query({ items: [] }))
  mockedFeature.mockReturnValue(false)
  mockedPermission.mockReturnValue(false)
})

describe('ClientProfilePage — case moved to another consultancy', () => {
  it('shows the read-only banner for closed_switched, with the date when closed_at is set', () => {
    mockedClient.mockReturnValue(query(baseClient({ status: 'closed_switched', closed_at: '2026-09-20' })))
    renderProfile()

    expect(
      screen.getByText(
        "This case moved to another consultancy on 20/09/2026 — you can read its history, but it's read-only now.",
      ),
    ).toBeInTheDocument()
  })

  it('hides Raise an Issue, Close Case and Reopen — nothing here is this consultancy’s to press', () => {
    mockedClient.mockReturnValue(query(baseClient({ status: 'closed_switched' })))
    renderProfile()

    expect(screen.queryByRole('button', { name: 'Raise an Issue' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close Case' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen Case' })).not.toBeInTheDocument()
  })

  it('passes readOnly through to the Overview tab', () => {
    mockedClient.mockReturnValue(query(baseClient({ status: 'closed_switched' })))
    renderProfile()

    expect(screen.getByTestId('overview-tab')).toHaveAttribute('data-readonly', 'true')
  })

  it('does not show the banner, and does not lock the tab, for a live case', () => {
    mockedClient.mockReturnValue(query(baseClient({ status: 'in_plan' })))
    renderProfile()

    expect(screen.queryByText(/read-only now/)).not.toBeInTheDocument()
    expect(screen.getByTestId('overview-tab')).toHaveAttribute('data-readonly', 'false')
    // A live case still gets its ordinary header actions.
    expect(screen.getByRole('button', { name: 'Raise an Issue' })).toBeInTheDocument()
  })
})

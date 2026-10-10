import { fireEvent, render, screen } from '@testing-library/react'
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
        "This case moved to another consultancy on 20-09-2026 — you can read its history, but it's read-only now.",
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

// Owner's ruling on review I-014 (2026-10-08): a case that arrived by a move says what came with it.
describe('ClientProfilePage — carried over', () => {
  it('names what came with a case that was moved here', () => {
    mockedClient.mockReturnValue(query(baseClient({ carried: ['documents', 'applications'] })))
    renderProfile()
    expect(screen.getByText('Carried over: documents, college applications')).toBeInTheDocument()
  })

  it('says "nothing" when the case was moved with nothing', () => {
    mockedClient.mockReturnValue(query(baseClient({ carried: [] })))
    renderProfile()
    expect(screen.getByText('Carried over: nothing')).toBeInTheDocument()
  })

  it('says nothing at all for a case that did not arrive by a move', () => {
    mockedClient.mockReturnValue(query(baseClient({ carried: null })))
    renderProfile()
    expect(screen.queryByText(/Carried over/)).not.toBeInTheDocument()
  })
})

// Review F-147 and the owner's ruling of 2026-10-06: "Reopen Case" follows the one shared rule.
describe('ClientProfilePage — Reopen Case', () => {
  it('is offered on a closed case when the plan includes reopening', () => {
    mockedFeature.mockReturnValue(true)
    mockedClient.mockReturnValue(query(baseClient({ status: 'closed', close_sub_reason: 'lost_contact' })))
    renderProfile()
    expect(screen.getByRole('button', { name: 'Reopen Case' })).toBeInTheDocument()
  })

  it('is hidden on a case that closed because the student deleted their account', () => {
    mockedFeature.mockReturnValue(true)
    mockedClient.mockReturnValue(query(baseClient({ status: 'closed', close_sub_reason: 'account_deleted' })))
    renderProfile()
    expect(screen.queryByRole('button', { name: 'Reopen Case' })).not.toBeInTheDocument()
  })

  it('is hidden on a plan without reopening', () => {
    mockedFeature.mockReturnValue(false)
    mockedClient.mockReturnValue(query(baseClient({ status: 'closed', close_sub_reason: 'lost_contact' })))
    renderProfile()
    expect(screen.queryByRole('button', { name: 'Reopen Case' })).not.toBeInTheDocument()
  })
})

function plan(statuses: string[]) {
  return { id: 'p', steps: statuses.map((status, i) => ({ id: `s${i}`, title: `Step ${i + 1}`, position: i, status, components: [] })) }
}

// Review 2.114: the button used to wait for a case status the server never stores. It now follows
// the plan's own steps. With a single plan it stays in the page header; with several it moves into
// the Plan tab's selected plan.
describe('ClientProfilePage — Reopen Plan is offered when the server will take it', () => {
  const reopenPlanButton = () => screen.queryByRole('button', { name: 'Reopen Plan' })

  beforeEach(() => {
    mockedFeature.mockReturnValue(true)
    mockedPermission.mockReturnValue(true)
    mockedClient.mockReturnValue(query(baseClient()))
  })

  it('shows on a live case whose newest plan is completed', () => {
    mockedPlans.mockReturnValue(query({ items: [plan(['done', 'done'])] }))
    renderProfile()
    expect(reopenPlanButton()).toBeInTheDocument()
  })

  // With several plans the header cannot say which plan it would reopen, so it offers nothing; the
  // control is in the selected plan's panel on the Plan tab instead
  // (ClientProfilePlanTab.reopen.test.tsx).
  it('is not in the header when the case runs several plans', () => {
    mockedPlans.mockReturnValue(query({ items: [plan(['done', 'active']), plan(['locked', 'locked'])] }))
    renderProfile()
    expect(reopenPlanButton()).not.toBeInTheDocument()
  })

  // Owner's ruling 2026-10-10: a completed step may be reopened beside a running one.
  it('shows while another step is in progress', () => {
    mockedPlans.mockReturnValue(query({ items: [plan(['done', 'active', 'locked'])] }))
    renderProfile()
    expect(reopenPlanButton()).toBeInTheDocument()
  })

  // The plan keeps one active step: the running one goes back to waiting, its work kept. The dialog
  // names both steps before the reopen is confirmed.
  it('says which step goes back to waiting, by name, when another step is in progress', () => {
    mockedPlans.mockReturnValue(query({ items: [plan(['done', 'done', 'active', 'locked'])] }))
    renderProfile()
    fireEvent.click(reopenPlanButton()!)
    expect(
      screen.getByText('Step 3 will go back to waiting until Step 2 is completed again. Its work is kept.'),
    ).toBeInTheDocument()
  })

  it('says nothing of the kind when no step is in progress, and names the last completed step', () => {
    mockedPlans.mockReturnValue(query({ items: [plan(['done', 'done', 'locked'])] }))
    renderProfile()
    fireEvent.click(reopenPlanButton()!)
    expect(screen.queryByText(/will go back to waiting/)).not.toBeInTheDocument()
    expect(screen.getByText('This reopens Step 2.')).toBeInTheDocument()
    expect(screen.getByText('To go further back, reopen one step at a time.')).toBeInTheDocument()
  })

  // One rule, no picker: only the most recently completed step is reopened, and the request names it.
  it('reopens only the step just before the one in progress, and sends it by id', () => {
    const mutate = vi.fn()
    mockedReopenPlan.mockReturnValue({ mutate, isPending: false, isError: false } as never)
    mockedPlans.mockReturnValue(query({ items: [plan(['done', 'done', 'done', 'active', 'locked'])] }))
    renderProfile()
    fireEvent.click(reopenPlanButton()!)
    expect(screen.getByText('This reopens Step 3.')).toBeInTheDocument()
    expect(screen.queryByText(/Step 1|Step 2/)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Wrong marks' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Reopen' }))
    expect(mutate.mock.calls[0][0]).toEqual({ reason: 'Wrong marks', stepId: 's2' })
  })

  it('hides when no step is completed, or there is no plan', () => {
    mockedPlans.mockReturnValue(query({ items: [plan(['active', 'locked'])] }))
    renderProfile()
    expect(reopenPlanButton()).not.toBeInTheDocument()
  })

  it('hides without the plan feature or the permission', () => {
    mockedPlans.mockReturnValue(query({ items: [plan(['done'])] }))
    mockedFeature.mockReturnValue(false)
    renderProfile()
    expect(reopenPlanButton()).not.toBeInTheDocument()
  })

  it.each(['closed', 'in_dispute', 'closed_switched'])('hides on a %s case', (status) => {
    mockedPlans.mockReturnValue(query({ items: [plan(['done'])] }))
    mockedClient.mockReturnValue(query(baseClient({ status })))
    renderProfile()
    expect(reopenPlanButton()).not.toBeInTheDocument()
  })
})

// Review F-069: a plan is reopened only at a completed step. The server refuses with 409
// `conflict` otherwise, and its sentence is shown beside the button.
describe('ClientProfilePage — Reopen Plan refused', () => {
  it('shows the server’s sentence', () => {
    mockedFeature.mockReturnValue(true)
    mockedPermission.mockReturnValue(true)
    mockedClient.mockReturnValue(query(baseClient()))
    mockedPlans.mockReturnValue(query({ items: [plan(['done', 'done'])] }))
    mockedReopenPlan.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: true,
      error: new Error('This plan has no completed step to reopen.'),
    } as never)
    renderProfile()

    fireEvent.click(screen.getByRole('button', { name: 'Reopen Plan' }))
    expect(screen.getByRole('alert')).toHaveTextContent('This plan has no completed step to reopen.')
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Reopen Plan on a case that runs SEVERAL plans side by side. The action belongs to the plan the
// consultant is looking at (owner's ruling 2026-10-10: the most recently completed step OF A PLAN),
// so it sits in the selected plan's panel and sends that plan's step id. The server applies the
// rule inside the plan that owns the step, so an older plan reopens even when the newest has no
// completed step. The page decides permission, plan feature and case state (`canReopenPlan`).
vi.mock('@/features/clients/PlanStepBuilder', () => ({ PlanStepBuilder: () => null }))
vi.mock('@/features/clients/AssignPlanModal', () => ({ AssignPlanModal: () => null }))
vi.mock('@/queries/clients', () => ({ useReopenPlan: vi.fn() }))
vi.mock('@/queries/plans', () => ({ usePlans: vi.fn() }))
vi.mock('@/lib/permissions', () => ({ usePermission: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { useReopenPlan } from '@/queries/clients'
import { usePlans } from '@/queries/plans'
import { usePermission } from '@/lib/permissions'
import { PlanTab } from './ClientProfilePlanTab'

function plan(id: string, name: string, statuses: string[]) {
  return {
    id,
    name,
    progress: `${statuses.filter((s) => s === 'done').length}/${statuses.length}`,
    steps: statuses.map((status, i) => ({
      id: `${id}-s${i + 1}`,
      title: `${name} step ${i + 1}`,
      position: i,
      status,
      components: [],
    })),
  }
}

// The demo case: the oldest plan has two done steps and one running; the newest has none done.
const masters = plan('p1', 'Masters', ['done', 'done', 'active', 'locked'])
const applications = plan('p2', 'Applications', ['done', 'active', 'locked'])
const permit = plan('p3', 'Permit', ['active', 'locked'])

function mockPlans(items: unknown[]) {
  vi.mocked(usePlans).mockReturnValue({ data: { items }, isLoading: false, isError: false } as never)
}

function renderTab(props: { canReopenPlan?: boolean } = {}) {
  return render(<PlanTab clientId="c1" canReopenPlan={props.canReopenPlan ?? true} />)
}

const reopenButton = () => screen.queryByRole('button', { name: 'Reopen Plan' })
const planCard = (name: string) => screen.getByRole('button', { name: new RegExp(name) })

beforeEach(() => {
  vi.mocked(useReopenPlan).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
  vi.mocked(usePermission).mockReturnValue(true)
})

describe('PlanTab — Reopen Plan with several plans', () => {
  it('is offered for an older plan even though the newest plan has no completed step', () => {
    mockPlans([masters, applications, permit])
    renderTab()
    // The first plan is the one shown.
    expect(reopenButton()).toBeInTheDocument()
    fireEvent.click(planCard('Permit'))
    expect(reopenButton()).not.toBeInTheDocument()
    fireEvent.click(planCard('Applications'))
    expect(reopenButton()).toBeInTheDocument()
  })

  it("names the plan and the one step, and sends that plan's step id", () => {
    const mutate = vi.fn()
    vi.mocked(useReopenPlan).mockReturnValue({ mutate, isPending: false, isError: false } as never)
    mockPlans([masters, applications, permit])
    renderTab()
    fireEvent.click(reopenButton()!)
    expect(screen.getByText('This reopens Masters step 2 in Masters.')).toBeInTheDocument()
    expect(
      screen.getByText('Masters step 3 will go back to waiting until Masters step 2 is completed again. Its work is kept.'),
    ).toBeInTheDocument()
    expect(screen.getByText('To go further back, reopen one step at a time.')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Wrong marks' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Reopen' }))
    expect(mutate.mock.calls[0][0]).toEqual({ reason: 'Wrong marks', stepId: 'p1-s2' })
  })

  it('acts on the plan that is selected, not the newest or the first', () => {
    const mutate = vi.fn()
    vi.mocked(useReopenPlan).mockReturnValue({ mutate, isPending: false, isError: false } as never)
    mockPlans([masters, applications, permit])
    renderTab()
    fireEvent.click(planCard('Applications'))
    fireEvent.click(reopenButton()!)
    expect(screen.getByText('This reopens Applications step 1 in Applications.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Typo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Reopen' }))
    expect(mutate.mock.calls[0][0]).toEqual({ reason: 'Typo', stepId: 'p2-s1' })
  })

  it('closes the dialog when another plan is picked', () => {
    mockPlans([masters, applications, permit])
    renderTab()
    fireEvent.click(reopenButton()!)
    expect(screen.getByLabelText(/Reason/)).toBeInTheDocument()
    fireEvent.click(planCard('Applications'))
    expect(screen.queryByLabelText(/Reason/)).not.toBeInTheDocument()
  })

  it('reopens the last completed step when nothing in the plan is in progress', () => {
    mockPlans([plan('a', 'Alpha', ['done', 'done', 'locked']), permit])
    renderTab()
    fireEvent.click(reopenButton()!)
    expect(screen.getByText('This reopens Alpha step 2 in Alpha.')).toBeInTheDocument()
    expect(screen.queryByText(/will go back to waiting/)).not.toBeInTheDocument()
  })

  it('offers nothing for a plan with no completed step', () => {
    mockPlans([permit, plan('q', 'Quiet', ['locked', 'locked'])])
    renderTab()
    expect(reopenButton()).not.toBeInTheDocument()
    fireEvent.click(planCard('Quiet'))
    expect(reopenButton()).not.toBeInTheDocument()
  })

  it('offers nothing without the permission, the plan feature or an open case', () => {
    mockPlans([masters, applications])
    renderTab({ canReopenPlan: false })
    expect(reopenButton()).not.toBeInTheDocument()
  })

  it('leaves a single plan to the page header', () => {
    mockPlans([masters])
    renderTab()
    expect(reopenButton()).not.toBeInTheDocument()
  })
})

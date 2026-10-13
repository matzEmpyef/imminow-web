import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

// T4-21: Mark Done ticks a task off in place (the button is beside the link, not inside it), a
// task on a lead opens the lead, and a task due later has the same Mark Done as one that is due.
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('./AssignTaskModal', () => ({ AssignTaskModal: () => null }))
const complete = vi.fn()
vi.mock('@/queries/activity', () => ({
  useActivityFeed: vi.fn(),
  useCompleteActivityTask: () => ({ mutate: complete, isPending: false, isError: false }),
  useCompletedActivityTasks: vi.fn(),
}))
vi.mock('./CompletedTasksSection', () => ({ CompletedTasksSection: () => null }))

import { useActivityFeed } from '@/queries/activity'
import { ActivityPage } from './ActivityPage'

const person = { user: { first_name: 'Neha', last_name: 'Verma' } }
function task(overrides: Record<string, unknown>) {
  return {
    status: 'open',
    assigned_to: person,
    assigned_by: person,
    created_at: '2026-01-01T00:00:00Z',
    due_time: null,
    ...overrides,
  }
}

function renderWith(tasks: unknown[]) {
  vi.mocked(useActivityFeed).mockReturnValue({
    data: {
      tasks,
      delegated_tasks: [],
      pending_step_approvals: [],
      unread_chats: [],
      overdue_steps: [],
      offers_awaiting_decision: [],
      ready_to_apply: [],
      pending_proposals: [],
      pending_plan_assignment: [],
      plan_complete_cases: [],
      upcoming_due_dates: [],
      application_deadlines: [],
      needs_action_today_count: 0,
      truncated: false,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never)
  render(
    <MemoryRouter>
      <ActivityPage />
    </MemoryRouter>,
  )
}

describe('Activity tasks', () => {
  it('keeps Mark Done outside the row link, so pressing it does not open the client', () => {
    renderWith([task({ id: 't1', note: 'Chase the form', client_name: 'Neha Rao', journey_id: 'j1', due_date: '2020-01-01' })])
    const button = screen.getByRole('button', { name: 'Mark Done' })
    expect(button.closest('a')).toBeNull()
    expect(screen.getByRole('link', { name: /Chase the form/ })).toHaveAttribute('href', '/clients/j1')
    fireEvent.click(button)
    expect(complete).toHaveBeenCalledWith('t1')
  })

  it('opens the lead from a lead task that carries the lead', () => {
    renderWith([task({ id: 't2', note: 'Call Aarav', lead_name: 'Aarav Varghese', lead_id: 'l1', due_date: '2020-01-01' })])
    expect(screen.getByRole('link', { name: /Call Aarav/ })).toHaveAttribute('href', '/sales/leads/l1')
  })

  it('gives a task due later the same Mark Done, and its time', () => {
    renderWith([task({ id: 't3', note: 'Follow up', lead_name: 'Aarav Varghese', lead_id: 'l1', due_date: '2099-01-01', due_time: '09:00' })])
    expect(screen.getByText(/Follow up \(Aarav Varghese\) · 09:00/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark Done' }))
    expect(complete).toHaveBeenCalledWith('t3')
  })
})

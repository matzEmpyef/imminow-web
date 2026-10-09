import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

// Review F-112: the activity feed is bounded. Each of its lists carries at most 200 rows and
// `truncated` says at least one was cut; the page says so under the list that is full, and under
// no other.
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('./AssignTaskModal', () => ({ AssignTaskModal: () => null }))
vi.mock('@/queries/activity', () => ({
  useActivityFeed: vi.fn(),
  useCompleteActivityTask: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useCompletedActivityTasks: vi.fn(),
}))

import { useActivityFeed } from '@/queries/activity'
import { ActivityPage } from './ActivityPage'

const NOTE = 'Showing the first 200. Finish some to see more.'

function feed(overrides: Record<string, unknown> = {}) {
  return {
    tasks: [],
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
    ...overrides,
  }
}

function chats(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `lead-${i}`, kind: 'lead', name: `Student ${i}` }))
}

function renderWith(data: ReturnType<typeof feed>) {
  vi.mocked(useActivityFeed).mockReturnValue({ data, isLoading: false, isError: false, refetch: vi.fn() } as never)
  render(
    <MemoryRouter>
      <ActivityPage />
    </MemoryRouter>,
  )
}

describe('the Activity page when the feed was cut', () => {
  it('says so under the list that is full, and only there', () => {
    renderWith(
      feed({
        truncated: true,
        unread_chats: chats(200),
        pending_plan_assignment: [{ journey_id: 'j1', client_name: 'Asha Nair' }],
      }),
    )
    const notes = screen.getAllByText(NOTE)
    expect(notes).toHaveLength(1)
    expect(notes[0].closest('div')).toHaveTextContent('Unread chats')
  })

  it('says nothing when the feed was not cut, however long a list is', () => {
    renderWith(feed({ truncated: false, unread_chats: chats(200) }))
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
  })

  it('says nothing under a short list of a feed that was cut elsewhere', () => {
    renderWith(feed({ truncated: true, unread_chats: chats(3) }))
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
  })
})

// 2026-10-09 (review F-112): the feed now says which of its two task lists was cut.
describe('the Activity page when a task list was cut', () => {
  const task = (id: string) => ({
    id,
    note: `Task ${id}`,
    status: 'open',
    due_date: '2000-01-01',
    assigned_to: { user: { first_name: 'Asha', last_name: 'Nair' } },
    assigned_by: { user: { first_name: 'Ravi', last_name: 'Das' } },
  })

  it('puts the notice under My tasks and Coming up when tasks_truncated, not under Tasks I’ve assigned', () => {
    renderWith(feed({ truncated: true, tasks_truncated: true, tasks: [task('a')], delegated_tasks: [task('b')] }))
    const notes = screen.getAllByText(NOTE)
    expect(notes).toHaveLength(2)
    expect(notes[0].closest('div')).toHaveTextContent('My tasks')
    expect(notes[1].closest('div')).toHaveTextContent('Coming up')
    expect(screen.getByText('Tasks I\'ve assigned').closest('div')).not.toHaveTextContent('Showing the first 200')
  })

  it('puts the notice under Tasks I’ve assigned when only delegated_tasks_truncated', () => {
    renderWith(feed({ truncated: true, delegated_tasks_truncated: true, tasks: [task('a')], delegated_tasks: [task('b')] }))
    const notes = screen.getAllByText(NOTE)
    expect(notes).toHaveLength(1)
    expect(notes[0].closest('div')).toHaveTextContent("Tasks I've assigned")
  })

  it('says nothing about a short list just because the flag is off', () => {
    renderWith(feed({ truncated: true, tasks_truncated: false, delegated_tasks_truncated: false, tasks: [task('a')] }))
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
  })
})

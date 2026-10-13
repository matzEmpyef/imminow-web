import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// UL19 / T4-35 "doubled history entry": two colleges added to one case at the same moment gave
// two rows the same key (case + moment). React warned and could drop or double a row. Each row now
// has its own key, and both are on screen.
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('./AssignTaskModal', () => ({ AssignTaskModal: () => null }))
vi.mock('@/queries/activity', () => ({
  useActivityFeed: vi.fn(),
  useCompleteActivityTask: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useCompletedActivityTasks: vi.fn(),
}))
vi.mock('./CompletedTasksSection', () => ({ CompletedTasksSection: () => null }))

import { useActivityFeed } from '@/queries/activity'
import { ActivityPage } from './ActivityPage'
import { collegeItemKey } from './collegeItemKey'

const SINCE = '2026-11-30T02:00:04.635333Z'
const item = (college: string, course: string) => ({
  journey_id: 'j1',
  client_name: 'Aarav Banerjee',
  course_name: course,
  college_name: college,
  since: SINCE,
})

afterEach(() => vi.restoreAllMocks())

describe('Activity: two colleges selected for one case at the same moment', () => {
  it('shows both rows in each list with no duplicate-key warning', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pair = [item('Univ A', 'MSc Data'), item('Univ B', 'MSc Data')]
    vi.mocked(useActivityFeed).mockReturnValue({
      data: {
        tasks: [],
        delegated_tasks: [],
        pending_step_approvals: [],
        unread_chats: [],
        overdue_steps: [],
        offers_awaiting_decision: pair,
        ready_to_apply: pair,
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
    expect(screen.getAllByText(/@ Univ A/)).toHaveLength(2)
    expect(screen.getAllByText(/@ Univ B/)).toHaveLength(2)
    const keyWarnings = errors.mock.calls.filter((c) => String(c[0]).includes('same key'))
    expect(keyWarnings).toHaveLength(0)
  })

  it('gives rows with the same case and moment different keys', () => {
    expect(collegeItemKey(item('Univ A', 'MSc'), 0)).not.toBe(collegeItemKey(item('Univ B', 'MSc'), 1))
    expect(collegeItemKey(item('Univ A', 'MSc'), 0)).not.toBe(collegeItemKey(item('Univ A', 'MSc'), 1))
  })
})

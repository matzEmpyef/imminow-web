import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { useActivityFeed, useCompleteActivityTask } from '@/queries/activity'
import { Skeleton } from '@/components/QueryState'
import { formatDate, formatDateTime } from '@/lib/time'
import { AssignTaskModal } from './AssignTaskModal'

export function ActivityPage() {
  const feed = useActivityFeed()
  const completeTask = useCompleteActivityTask()

  const [showAssignTask, setShowAssignTask] = useState(false)

  if (feed.isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 rounded-lg" />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Activity</h1>
            <p className="text-body-sm text-text-secondary">
              Overdue steps, unattended cases, and upcoming due dates — action-oriented, not a dashboard summary.
            </p>
          </div>
          <Button onClick={() => setShowAssignTask(true)}>Assign Task</Button>
        </div>

        {showAssignTask && <AssignTaskModal onClose={() => setShowAssignTask(false)} />}

        {/* Folded in from the now-retired standalone Step Approvals page (user-requested,
            2026-08-19 — "instead of separate page show it activities"). A row links straight to
            the Plan tab with that step pre-selected rather than approving/rejecting inline —
            "Do not confirm complete from here, but redirect to client plan tab and to the
            specific step" — the actual Approve/Send Back actions now live in PlanStepBuilder. */}
        <Card>
          <p className="text-body-sm font-medium text-text-primary">Step Approvals</p>
          <div className="mt-sm flex flex-col gap-xs">
            {feed.data?.pending_step_approvals.length === 0 && (
              <p className="text-caption text-text-secondary">Nothing pending review right now.</p>
            )}
            {feed.data?.pending_step_approvals.map((item) => (
              <Link
                key={item.step_id}
                to={`/clients/${item.journey_id}?tab=Plan&step=${item.step_id}`}
                className="flex items-center justify-between border-b border-border pb-xs last:border-0 hover:text-primary"
              >
                <div>
                  <p className="text-body-sm text-text-primary">
                    {item.client_name} — {item.step_title}
                  </p>
                  <p className="text-caption text-text-secondary">Submitted {formatDateTime(item.submitted_at)}</p>
                </div>
                <Badge color="warning">Review</Badge>
              </Link>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-lg md:grid-cols-3">
          <Card>
            <p className="text-body-sm font-medium text-text-primary">Overdue Steps</p>
            <div className="mt-sm flex flex-col gap-xs">
              {feed.data?.overdue_steps.length === 0 && <p className="text-caption text-text-secondary">None.</p>}
              {feed.data?.overdue_steps.map((item, i) => (
                <div key={i} className="border-b border-border pb-xs last:border-0">
                  <p className="text-body-sm text-text-primary">
                    {item.client_name} — {item.step_title}
                  </p>
                  <Badge color="error">Due {item.expected_end_date ? formatDate(item.expected_end_date) : '—'}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <p className="text-body-sm font-medium text-text-primary">Unattended Cases</p>
            <div className="mt-sm flex flex-col gap-xs">
              {feed.data?.unattended_cases.length === 0 && <p className="text-caption text-text-secondary">None.</p>}
              {feed.data?.unattended_cases.map((item) => (
                <div key={item.id} className="border-b border-border pb-xs last:border-0">
                  <p className="text-body-sm text-text-primary">{item.name}</p>
                  <Badge color="warning">{item.type}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <p className="text-body-sm font-medium text-text-primary">Upcoming Due Dates</p>
            <div className="mt-sm flex flex-col gap-xs">
              {feed.data?.upcoming_due_dates.length === 0 && <p className="text-caption text-text-secondary">None.</p>}
              {feed.data?.upcoming_due_dates.map((item, i) => (
                <div key={i} className="border-b border-border pb-xs last:border-0">
                  <p className="text-body-sm text-text-primary">
                    {item.client_name} — {item.step_title}
                  </p>
                  <Badge color="info">Due {item.expected_end_date ? formatDate(item.expected_end_date) : '—'}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card>
          <p className="text-body-sm font-medium text-text-primary">Assigned Tasks</p>
          <div className="mt-sm flex flex-col gap-xs">
            {feed.data?.tasks.length === 0 && <p className="text-caption text-text-secondary">No tasks assigned.</p>}
            {feed.data?.tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-md border-b border-border py-xs last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm text-text-primary">
                    {task.note}
                    {task.client_name ? ` (${task.client_name})` : ''}
                    {task.lead_name ? ` (${task.lead_name})` : ''}
                  </p>
                  <p className="text-caption text-text-secondary">
                    {task.assigned_to.user!.first_name} {task.assigned_to.user!.last_name} · Due{' '}
                    {formatDate(task.due_date)}
                    {task.due_time ? `, ${task.due_time}` : ''} · Assigned by {task.assigned_by.user!.first_name}{' '}
                    {task.assigned_by.user!.last_name}
                  </p>
                </div>
                {(task.client_name || task.lead_name) && (
                  <span className="shrink-0 rounded-full bg-background px-sm py-0.5 text-caption font-medium text-text-secondary">
                    {task.client_name ? 'Applicant' : 'Aspirant'}
                  </span>
                )}
                <Badge color={task.status === 'done' ? 'success' : 'warning'}>{task.status}</Badge>
                {task.status === 'open' && (
                  <Button
                    variant="secondary"
                    loading={completeTask.isPending}
                    onClick={() => completeTask.mutate(task.id)}
                  >
                    Mark Done
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  )
}

import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { StopPropagation } from '@/components/StopPropagation'
import { useActivityFeed, useCompleteActivityTask } from '@/queries/activity'
import { Skeleton, ErrorState } from '@/components/QueryState'
import { formatDate, formatDateTime, formatDayLabel } from '@/lib/time'
import { AssignTaskModal } from './AssignTaskModal'
import type { components } from '@/api/schema'

type ActivityTask = components['schemas']['ActivityTask']

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

// The shared shell every "Needs your action" section uses — title, a count badge, a list of
// rows. Only ever rendered when `count > 0` (the caller decides that), so there is no empty
// state to handle in here.
function ActionSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-body-sm font-medium text-text-primary">{title}</p>
        <Badge color="primary">{count}</Badge>
      </div>
      <div className="mt-sm flex flex-col gap-xs">{children}</div>
    </Card>
  )
}

// Whole-row Link, same convention this page already used for Step Approvals before the rebuild
// — the entire row is the click target, not just the client name inside it.
function ActionRow({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-md border-b border-border pb-xs last:border-0 last:pb-0 hover:text-primary"
    >
      {children}
    </Link>
  )
}

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

  if (feed.isError || !feed.data) {
    return (
      <AppShell>
        <ErrorState message="Could not load your activity feed." onRetry={() => feed.refetch()} />
      </AppShell>
    )
  }

  const data = feed.data
  const today = todayIso()

  // "My tasks due/overdue" — open, due today or earlier (same window needs_action_today_count
  // itself counts server-side). Future open tasks show instead under Coming Up.
  const myTasksDue = data.tasks.filter((t) => t.status === 'open' && t.due_date <= today)
  const myTasksFuture = data.tasks.filter((t) => t.status === 'open' && t.due_date > today)

  const hasAnyAction =
    data.pending_step_approvals.length > 0 ||
    data.unread_chats.length > 0 ||
    data.offers_awaiting_decision.length > 0 ||
    data.ready_to_apply.length > 0 ||
    data.overdue_steps.length > 0 ||
    data.pending_proposals.length > 0 ||
    data.pending_plan_assignment.length > 0 ||
    data.plan_complete_cases.length > 0 ||
    myTasksDue.length > 0

  // One merged, date-grouped timeline (user decision, 2026-08-29): future tasks, upcoming step
  // dates, application deadlines, and conversion proposals — everything with a date attached —
  // typed with a small badge and grouped by day via formatDayLabel (Today/Tomorrow/dd-mm-yyyy).
  type ComingUpRow = { key: string; date: string; kind: 'Task' | 'Step' | 'Deadline' | 'Proposal'; to: string | null; label: ReactNode }

  const comingUpRows: ComingUpRow[] = [
    ...myTasksFuture.map((t) => ({
      key: `task-${t.id}`,
      date: t.due_date,
      kind: 'Task' as const,
      to: t.journey_id ? `/clients/${t.journey_id}` : null,
      label: (
        <>
          {t.note}
          {t.client_name ? ` (${t.client_name})` : t.lead_name ? ` (${t.lead_name})` : ''}
        </>
      ),
    })),
    ...data.upcoming_due_dates.map((s) => ({
      key: `step-${s.step_id}`,
      date: s.expected_end_date,
      kind: 'Step' as const,
      to: `/clients/${s.journey_id}?tab=Plan&step=${s.step_id}`,
      label: (
        <>
          {s.client_name} — {s.step_title}
        </>
      ),
    })),
    ...data.application_deadlines.map((d) => ({
      key: `deadline-${d.journey_id}-${d.deadline}`,
      date: d.deadline,
      kind: 'Deadline' as const,
      to: `/clients/${d.journey_id}?tab=Selected Colleges`,
      label: (
        <>
          {d.client_name} — {d.course_name}
          {d.college_name ? ` @ ${d.college_name}` : ''}
        </>
      ),
    })),
    ...data.pending_proposals.map((p) => ({
      key: `proposal-${p.lead_id}`,
      date: p.expires_at,
      kind: 'Proposal' as const,
      to: `/sales/leads/${p.lead_id}`,
      label: <>{p.lead_name ?? 'Lead'} — conversion proposal</>,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const comingUpGroups: { label: string; rows: ComingUpRow[] }[] = []
  for (const row of comingUpRows) {
    const label = formatDayLabel(row.date)
    const group = comingUpGroups.at(-1)
    if (group && group.label === label) group.rows.push(row)
    else comingUpGroups.push({ label, rows: [row] })
  }

  const kindColor = { Task: 'primary', Step: 'info', Deadline: 'warning', Proposal: 'secondary' } as const

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Activity</h1>
            <p className="text-body-sm text-text-secondary">
              What needs your action today, and what's coming up — strictly your own assigned work.
            </p>
          </div>
          <Button onClick={() => setShowAssignTask(true)}>Assign Task</Button>
        </div>

        {showAssignTask && <AssignTaskModal onClose={() => setShowAssignTask(false)} />}

        {!hasAnyAction && (
          <Card className="text-center">
            <p className="text-body font-medium text-text-primary">You're all caught up</p>
            <p className="mt-xs text-body-sm text-text-secondary">Nothing needs your action right now.</p>
          </Card>
        )}

        {hasAnyAction && (
          <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
            {data.pending_step_approvals.length > 0 && (
              <ActionSection title="Steps to review" count={data.pending_step_approvals.length}>
                {data.pending_step_approvals.map((item) => (
                  <ActionRow key={item.step_id} to={`/clients/${item.journey_id}?tab=Plan&step=${item.step_id}`}>
                    <div>
                      <p className="text-body-sm text-text-primary">
                        {item.client_name} — {item.step_title}
                      </p>
                      <p className="text-caption text-text-secondary">Submitted {formatDateTime(item.submitted_at)}</p>
                    </div>
                    <Badge color="warning">Review</Badge>
                  </ActionRow>
                ))}
              </ActionSection>
            )}

            {data.unread_chats.length > 0 && (
              <ActionSection title="Unread chats" count={data.unread_chats.length}>
                {data.unread_chats.map((item) => (
                  <ActionRow
                    key={item.id}
                    to={item.kind === 'client' ? `/clients/${item.id}/conversation` : `/sales/leads/${item.id}`}
                  >
                    <p className="text-body-sm text-text-primary">{item.name}</p>
                    <Badge color="info">{item.kind === 'client' ? 'Client' : 'Lead'}</Badge>
                  </ActionRow>
                ))}
              </ActionSection>
            )}

            {data.overdue_steps.length > 0 && (
              <ActionSection title="Overdue steps" count={data.overdue_steps.length}>
                {data.overdue_steps.map((item) => (
                  <ActionRow key={item.step_id} to={`/clients/${item.journey_id}?tab=Plan&step=${item.step_id}`}>
                    <p className="text-body-sm text-text-primary">
                      {item.client_name} — {item.step_title}
                    </p>
                    <Badge color="error">Due {formatDate(item.expected_end_date)}</Badge>
                  </ActionRow>
                ))}
              </ActionSection>
            )}

            {data.offers_awaiting_decision.length > 0 && (
              <ActionSection title="Offers awaiting decision" count={data.offers_awaiting_decision.length}>
                {data.offers_awaiting_decision.map((item) => (
                  <ActionRow key={item.journey_id + item.since} to={`/clients/${item.journey_id}?tab=Selected Colleges`}>
                    <p className="text-body-sm text-text-primary">
                      {item.client_name} — {item.course_name}
                      {item.college_name ? ` @ ${item.college_name}` : ''}
                    </p>
                    <Badge color="success">Offer</Badge>
                  </ActionRow>
                ))}
              </ActionSection>
            )}

            {data.ready_to_apply.length > 0 && (
              <ActionSection title="Ready to apply" count={data.ready_to_apply.length}>
                {data.ready_to_apply.map((item) => (
                  <ActionRow key={item.journey_id + item.since} to={`/clients/${item.journey_id}?tab=Selected Colleges`}>
                    <p className="text-body-sm text-text-primary">
                      {item.client_name} — {item.course_name}
                      {item.college_name ? ` @ ${item.college_name}` : ''}
                    </p>
                    <Badge color="primary">Approved by student</Badge>
                  </ActionRow>
                ))}
              </ActionSection>
            )}

            {data.pending_proposals.length > 0 && (
              <ActionSection title="Conversion proposals" count={data.pending_proposals.length}>
                {data.pending_proposals.map((item) => {
                  const days = daysUntil(item.expires_at)
                  return (
                    <ActionRow key={item.lead_id} to={`/sales/leads/${item.lead_id}`}>
                      <p className="text-body-sm text-text-primary">{item.lead_name ?? 'Lead'}</p>
                      <Badge color={days <= 2 ? 'error' : 'secondary'}>
                        {days <= 0 ? 'expires today' : `expires in ${days}d`}
                      </Badge>
                    </ActionRow>
                  )
                })}
              </ActionSection>
            )}

            {data.pending_plan_assignment.length > 0 && (
              <ActionSection title="Pending plan assignment" count={data.pending_plan_assignment.length}>
                {data.pending_plan_assignment.map((item) => (
                  <ActionRow key={item.journey_id} to={`/clients/${item.journey_id}`}>
                    <p className="text-body-sm text-text-primary">{item.client_name}</p>
                    <Badge color="warning">No plan yet</Badge>
                  </ActionRow>
                ))}
              </ActionSection>
            )}

            {data.plan_complete_cases.length > 0 && (
              <ActionSection title="Plan complete" count={data.plan_complete_cases.length}>
                {data.plan_complete_cases.map((item) => (
                  <ActionRow key={item.journey_id} to={`/clients/${item.journey_id}`}>
                    <p className="text-body-sm text-text-primary">{item.client_name}</p>
                    <Badge color="success">Complete</Badge>
                  </ActionRow>
                ))}
              </ActionSection>
            )}

            {myTasksDue.length > 0 && (
              <ActionSection title="My tasks" count={myTasksDue.length}>
                {/* N6 (second-pass review): a failed complete used to vanish silently, and one
                    shared isPending put every row's button into "Please wait…" for any click —
                    `variables` scopes the spinner to the row actually in flight. */}
                {completeTask.isError && (
                  <p className="text-body-sm text-error">{completeTask.error.message}</p>
                )}
                {myTasksDue.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onComplete={() => completeTask.mutate(task.id)}
                    pending={completeTask.isPending && completeTask.variables === task.id}
                  />
                ))}
              </ActionSection>
            )}
          </div>
        )}

        <Card>
          <p className="text-body-sm font-medium text-text-primary">Coming up</p>
          {comingUpGroups.length === 0 && (
            <p className="mt-sm text-caption text-text-secondary">Nothing scheduled ahead right now.</p>
          )}
          <div className="mt-sm flex flex-col gap-md">
            {comingUpGroups.map((group) => (
              <div key={group.label}>
                <p className="text-caption font-semibold uppercase text-text-secondary">{group.label}</p>
                <div className="mt-xs flex flex-col gap-xs">
                  {group.rows.map((row) => {
                    const content = (
                      <>
                        <p className="min-w-0 flex-1 truncate text-body-sm text-text-primary">{row.label}</p>
                        <Badge color={kindColor[row.kind]}>{row.kind}</Badge>
                      </>
                    )
                    return row.to ? (
                      <Link
                        key={row.key}
                        to={row.to}
                        className="flex items-center gap-md border-b border-border pb-xs last:border-0 last:pb-0 hover:text-primary"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div key={row.key} className="flex items-center gap-md border-b border-border pb-xs last:border-0 last:pb-0">
                        {content}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {data.delegated_tasks.length > 0 && (
          <Card>
            <p className="text-body-sm font-medium text-text-primary">Tasks I've assigned</p>
            <div className="mt-sm flex flex-col gap-xs">
              {data.delegated_tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-md border-b border-border py-xs last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm text-text-primary">
                      {task.note}
                      {task.client_name &&
                        (task.journey_id ? (
                          <>
                            {' ('}
                            <Link to={`/clients/${task.journey_id}`} className="hover:text-primary hover:underline">
                              {task.client_name}
                            </Link>
                            {')'}
                          </>
                        ) : (
                          ` (${task.client_name})`
                        ))}
                      {task.lead_name ? ` (${task.lead_name})` : ''}
                    </p>
                    <p className="text-caption text-text-secondary">
                      {task.assigned_to.user!.first_name} {task.assigned_to.user!.last_name} · Due{' '}
                      {formatDate(task.due_date)}
                      {task.due_time ? `, ${task.due_time}` : ''}
                    </p>
                  </div>
                  <Badge color={task.status === 'done' ? 'success' : 'warning'}>
                    {task.status === 'done' ? 'Done' : 'Open'}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  )
}

// One "My tasks" row — whole-row Link to the related client (when there is one), with the Mark
// Done button wrapped in StopPropagation so clicking it doesn't also navigate away.
function TaskRow({ task, onComplete, pending }: { task: ActivityTask; onComplete: () => void; pending: boolean }) {
  const to = task.journey_id ? `/clients/${task.journey_id}` : null
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm text-text-primary">
          {task.note}
          {task.client_name ? ` (${task.client_name})` : task.lead_name ? ` (${task.lead_name})` : ''}
        </p>
        <p className="text-caption text-text-secondary">
          Due {formatDate(task.due_date)}
          {task.due_time ? `, ${task.due_time}` : ''}
        </p>
      </div>
      <StopPropagation>
        <Button variant="secondary" loading={pending} onClick={onComplete}>
          Mark Done
        </Button>
      </StopPropagation>
    </>
  )
  return to ? (
    <Link to={to} className="flex items-center gap-md border-b border-border pb-xs last:border-0 last:pb-0 hover:text-primary">
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-md border-b border-border pb-xs last:border-0 last:pb-0">{body}</div>
  )
}

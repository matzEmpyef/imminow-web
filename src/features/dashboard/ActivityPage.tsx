import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { clientTabPath } from '@/lib/clientTabs'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { useActivityFeed, useCompleteActivityTask } from '@/queries/activity'
import { Skeleton, ErrorState } from '@/components/QueryState'
import {
  AWAITING_REVIEW_WARNING_DAYS,
  awaitingReviewLabel,
  daysUntil,
  daysSince,
  formatDate,
  formatDateTime,
  formatDayLabel,
  localDateISO,
} from '@/lib/time'
import { AssignTaskModal } from './AssignTaskModal'
import { CompletedTasksSection } from './CompletedTasksSection'
import type { components } from '@/api/schema'

// A task on a lead carries the lead's id so the row can open the lead (T4-21). The feed does not
// serve it yet; until it does, a lead's task simply has nowhere to link to.
type ActivityTask = components['schemas']['ActivityTask'] & { lead_id?: string | null }

/** Where a task's row leads: its client, else its lead, else nowhere. */
export function taskTarget(task: ActivityTask): string | null {
  if (task.journey_id) return `/clients/${task.journey_id}`
  if (task.lead_id) return `/sales/leads/${task.lead_id}`
  return null
}

// The feed is bounded (review F-112): each of its lists carries at most this many rows, and
// `truncated` says at least one was cut. The contract names the number; it is not sent per list,
// so a list holding exactly this many while `truncated` is true is taken to be a cut one. The two
// task lists are the exception: `tasks_truncated` and `delegated_tasks_truncated` (2026-10-09)
// say outright which of them was cut, and are read first.
const FEED_LIST_CAP = 200

function FirstRowsNote() {
  return <p className="mt-sm text-caption text-text-secondary">Showing the first 200. Finish some to see more.</p>
}

// The shared shell every "Needs your action" section uses — title, a count badge, a list of
// rows. Only ever rendered when `count > 0` (the caller decides that), so there is no empty
// state to handle in here.
function ActionSection({
  title,
  count,
  cut = false,
  children,
}: {
  title: string
  count: number
  /** The server cut this list at its cap: say so under it. */
  cut?: boolean
  children: ReactNode
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-body-sm font-medium text-text-primary">{title}</p>
        <Badge color="primary">{count}</Badge>
      </div>
      <div className="mt-sm flex flex-col gap-xs">{children}</div>
      {cut && <FirstRowsNote />}
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
        <ErrorState message="Could not load your activity feed." onRetry={() => feed.refetch()} error={feed.error} />
      </AppShell>
    )
  }

  const data = feed.data
  const today = localDateISO()
  const cut = (list: unknown[]) => data.truncated === true && list.length >= FEED_LIST_CAP
  const tasksCut = typeof data.tasks_truncated === 'boolean' ? data.tasks_truncated : cut(data.tasks)
  const delegatedCut =
    typeof data.delegated_tasks_truncated === 'boolean' ? data.delegated_tasks_truncated : cut(data.delegated_tasks)

  // "My tasks due/overdue" — open, due today or earlier (same window needs_action_today_count
  // itself counts server-side). Future open tasks show instead under Coming Up.
  // Overdue first, then by due date (H8, 2026-09-13): a task three days late read exactly like
  // one due this afternoon, sitting wherever the server happened to return it.
  const myTasksDue = data.tasks
    .filter((t) => t.status === 'open' && t.due_date <= today)
    .slice()
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
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
  type ComingUpRow = {
    key: string
    date: string
    kind: 'Task' | 'Step' | 'Deadline' | 'Proposal'
    to: string | null
    label: ReactNode
    /** A task row can be ticked off from here, like one that is due. */
    taskId?: string
  }

  const comingUpRows: ComingUpRow[] = [
    ...myTasksFuture.map((t) => ({
      key: `task-${t.id}`,
      date: t.due_date,
      kind: 'Task' as const,
      to: taskTarget(t),
      taskId: t.id,
      label: (
        <>
          {t.note}
          {t.client_name ? ` (${t.client_name})` : t.lead_name ? ` (${t.lead_name})` : ''}
          {t.due_time ? ` · ${t.due_time}` : ''}
        </>
      ),
    })),
    ...data.upcoming_due_dates.map((s) => ({
      key: `step-${s.step_id}`,
      date: s.expected_end_date,
      kind: 'Step' as const,
      to: clientTabPath(s.journey_id, 'Plan', { step: s.step_id }),
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
      to: clientTabPath(d.journey_id, 'Applications'),
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
              <ActionSection title="Steps to review" count={data.pending_step_approvals.length} cut={cut(data.pending_step_approvals)}>
                {data.pending_step_approvals.map((item) => (
                  <ActionRow key={item.step_id} to={clientTabPath(item.journey_id, 'Plan', { step: item.step_id })}>
                    <div>
                      <p className="text-body-sm text-text-primary">
                        {item.client_name} — {item.step_title}
                      </p>
                      <p className="text-caption text-text-secondary">Submitted {formatDateTime(item.submitted_at)}</p>
                      {/* H8 (2026-09-13): the submission date alone made nobody count. */}
                      <p
                        className={`text-caption ${
                          daysSince(item.submitted_at) >= AWAITING_REVIEW_WARNING_DAYS
                            ? 'font-medium text-warning'
                            : 'text-text-secondary'
                        }`}
                      >
                        {awaitingReviewLabel(item.submitted_at)}
                      </p>
                    </div>
                    <Badge color="warning">Review</Badge>
                  </ActionRow>
                ))}
              </ActionSection>
            )}

            {data.unread_chats.length > 0 && (
              <ActionSection title="Unread chats" count={data.unread_chats.length} cut={cut(data.unread_chats)}>
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
              <ActionSection title="Overdue steps" count={data.overdue_steps.length} cut={cut(data.overdue_steps)}>
                {data.overdue_steps.map((item) => (
                  <ActionRow key={item.step_id} to={clientTabPath(item.journey_id, 'Plan', { step: item.step_id })}>
                    <p className="text-body-sm text-text-primary">
                      {item.client_name} — {item.step_title}
                    </p>
                    <Badge color="error">Due {formatDate(item.expected_end_date)}</Badge>
                  </ActionRow>
                ))}
              </ActionSection>
            )}

            {data.offers_awaiting_decision.length > 0 && (
              <ActionSection title="Offers awaiting decision" count={data.offers_awaiting_decision.length} cut={cut(data.offers_awaiting_decision)}>
                {data.offers_awaiting_decision.map((item) => (
                  <ActionRow key={item.journey_id + item.since} to={clientTabPath(item.journey_id, 'Applications')}>
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
              <ActionSection title="Ready to apply" count={data.ready_to_apply.length} cut={cut(data.ready_to_apply)}>
                {data.ready_to_apply.map((item) => (
                  <ActionRow key={item.journey_id + item.since} to={clientTabPath(item.journey_id, 'Applications')}>
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
              <ActionSection title="Conversion proposals" count={data.pending_proposals.length} cut={cut(data.pending_proposals)}>
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
              <ActionSection title="Pending plan assignment" count={data.pending_plan_assignment.length} cut={cut(data.pending_plan_assignment)}>
                {data.pending_plan_assignment.map((item) => (
                  <ActionRow key={item.journey_id} to={`/clients/${item.journey_id}`}>
                    <p className="text-body-sm text-text-primary">{item.client_name}</p>
                    <Badge color="warning">No plan yet</Badge>
                  </ActionRow>
                ))}
              </ActionSection>
            )}

            {data.plan_complete_cases.length > 0 && (
              <ActionSection title="Plan complete" count={data.plan_complete_cases.length} cut={cut(data.plan_complete_cases)}>
                {data.plan_complete_cases.map((item) => (
                  <ActionRow key={item.journey_id} to={`/clients/${item.journey_id}`}>
                    <p className="text-body-sm text-text-primary">{item.client_name}</p>
                    <Badge color="success">Complete</Badge>
                  </ActionRow>
                ))}
              </ActionSection>
            )}

            {myTasksDue.length > 0 && (
              <ActionSection title="My tasks" count={myTasksDue.length} cut={tasksCut}>
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
                    overdue={task.due_date < today}
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
                    // The link covers the words only. The Mark Done button sits beside it, not inside
                    // it, so pressing it ticks the task off in place instead of opening the page.
                    const words = (
                      <p className="min-w-0 flex-1 break-words text-body-sm text-text-primary">{row.label}</p>
                    )
                    return (
                      <div
                        key={row.key}
                        className="flex items-center gap-md border-b border-border pb-xs last:border-0 last:pb-0"
                      >
                        {row.to ? (
                          <Link to={row.to} className="flex min-w-0 flex-1 hover:text-primary">
                            {words}
                          </Link>
                        ) : (
                          words
                        )}
                        <Badge color={kindColor[row.kind]}>{row.kind}</Badge>
                        {row.taskId && (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={completeTask.isPending && completeTask.variables === row.taskId}
                            onClick={() => completeTask.mutate(row.taskId!)}
                          >
                            Mark Done
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {(tasksCut || cut(data.upcoming_due_dates) || cut(data.application_deadlines) || cut(data.pending_proposals)) && (
            <FirstRowsNote />
          )}
        </Card>

        {data.delegated_tasks.length > 0 && (
          <Card>
            <p className="text-body-sm font-medium text-text-primary">Tasks I've assigned</p>
            <div className="mt-sm flex flex-col gap-xs">
              {[...data.delegated_tasks]
                .sort(
                  (a, b) =>
                    Number(a.status === 'done') - Number(b.status === 'done') ||
                    a.due_date.localeCompare(b.due_date),
                )
                .map((task) => (
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
                      {task.lead_name &&
                        (task.lead_id ? (
                          <>
                            {' ('}
                            <Link to={`/sales/leads/${task.lead_id}`} className="hover:text-primary hover:underline">
                              {task.lead_name}
                            </Link>
                            {')'}
                          </>
                        ) : (
                          ` (${task.lead_name})`
                        ))}
                    </p>
                    <p className="text-caption text-text-secondary">
                      {task.assigned_to.user!.first_name} {task.assigned_to.user!.last_name} · Due{' '}
                      {formatDate(task.due_date)}
                      {task.due_time ? `, ${task.due_time}` : ''}
                    </p>
                  </div>
                  {task.status === 'done' ? (
                    <Badge color="success">Done</Badge>
                  ) : task.due_date < today ? (
                    <Badge color="error">Overdue</Badge>
                  ) : (
                    <Badge color="warning">Open</Badge>
                  )}
                </div>
              ))}
            </div>
            {delegatedCut && <FirstRowsNote />}
          </Card>
        )}

        <CompletedTasksSection />
      </div>
    </AppShell>
  )
}

// One "My tasks" row — the words link to the related client or lead (when there is one).
function TaskRow({
  task,
  onComplete,
  pending,
  overdue,
}: {
  task: ActivityTask
  onComplete: () => void
  pending: boolean
  // Past its due date and still open (H8) — the row has to look different from one due today.
  overdue: boolean
}) {
  const to = taskTarget(task)
  const body = (
    <div className="min-w-0 flex-1">
        <p className="break-words text-body-sm text-text-primary">
          {task.note}
          {task.client_name ? ` (${task.client_name})` : task.lead_name ? ` (${task.lead_name})` : ''}
        </p>
        <p className="flex items-center gap-xs text-caption text-text-secondary">
          {overdue && <Badge color="error">Overdue</Badge>}
          <span>
            Due {formatDate(task.due_date)}
            {task.due_time ? `, ${task.due_time}` : ''}
          </span>
        </p>
    </div>
  )
  // The link covers the words only; Mark Done is beside it, not inside it, so pressing it ticks the
  // task off in place instead of also opening the client's page.
  return (
    <div className="flex items-center gap-md border-b border-border pb-xs last:border-0 last:pb-0">
      {to ? (
        <Link to={to} className="flex min-w-0 flex-1 hover:text-primary">
          {body}
        </Link>
      ) : (
        body
      )}
      <Button variant="secondary" loading={pending} onClick={onComplete}>
        Mark Done
      </Button>
    </div>
  )
}

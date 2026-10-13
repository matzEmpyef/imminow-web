import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/Badge'
import { Card } from '@/components/Card'
import { CursorPager } from '@/components/CursorPager'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Button } from '@/components/Button'
import { ErrorReference } from '@/components/ErrorReference'
import { Skeleton } from '@/components/QueryState'
import { useCompletedActivityTasks } from '@/queries/activity'
import { cursorPager, useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'
import type { components } from '@/api/schema'

type ActivityTask = components['schemas']['ActivityTask']
type Employee = components['schemas']['Employee']

function personName(employee: Employee | null | undefined): string {
  const user = employee?.user
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'a colleague'
}

/** How old a completed task must be to have left the feed (the server's rule, review F-112). */
const FEED_COMPLETED_DAYS = 30

const SCOPES = [
  { value: 'all', label: 'All I can see' },
  { value: 'mine', label: 'Assigned to me' },
] as const

/**
 * "Completed tasks older than 30 days" (review F-112). The activity feed keeps only the tasks
 * completed in the last 30 days; this is where the older ones are read, newest completed first,
 * a page at a time.
 *
 * "All I can see" is what the route serves with no narrowing: the tasks the caller gave or was
 * given, those on a case they can work on, and every task of the consultancy for an admin.
 * "Assigned to me" is `assigned_to_me=true`.
 */
export function CompletedTasksSection() {
  // The cut-off is fixed when the list is opened, so paging does not move it under the reader.
  const [before, setBefore] = useState<string | null>(null)
  if (!before) {
    return (
      <p className="text-body-sm">
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => setBefore(new Date(Date.now() - FEED_COMPLETED_DAYS * 86_400_000).toISOString())}
        >
          Completed tasks older than {FEED_COMPLETED_DAYS} days
        </button>
      </p>
    )
  }
  return <OlderCompleted before={before} onClose={() => setBefore(null)} />
}

function OlderCompleted({ before, onClose }: { before: string; onClose: () => void }) {
  const paging = useCursorPagination()
  const [scope, setScope] = useState<'all' | 'mine'>('all')
  const completed = useCompletedActivityTasks({ before, mine: scope === 'mine' }, paging.cursor)
  const rows = completed.data?.items ?? []

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-md">
        <p className="text-body-sm font-medium text-text-primary">
          Completed tasks older than {FEED_COMPLETED_DAYS} days
        </p>
        <button type="button" className="text-body-sm text-text-secondary hover:underline" onClick={onClose}>
          Hide
        </button>
      </div>
      <div className="mt-sm">
        <SegmentedControl
          label="Show"
          hideLabel
          value={scope}
          onChange={(next) => {
            setScope(next)
            paging.reset()
          }}
          options={SCOPES.map((s) => ({ ...s }))}
        />
      </div>

      {completed.isLoading ? (
        <Skeleton className="mt-sm h-24 rounded-lg" />
      ) : completed.isError ? (
        <div className="mt-sm flex items-center justify-between gap-md">
          <div className="min-w-0">
            <p className="text-body-sm text-error">Could not load completed tasks.</p>
            <ErrorReference error={completed.error} className="mt-0.5" />
          </div>
          <Button variant="secondary" size="sm" onClick={() => completed.refetch()}>
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-sm text-caption text-text-secondary">No completed tasks older than {FEED_COMPLETED_DAYS} days.</p>
      ) : (
        <div className="mt-sm flex flex-col gap-xs">
          {rows.map((task) => (
            <CompletedRow key={task.id} task={task} />
          ))}
        </div>
      )}
      <CursorPager {...cursorPager(paging, completed.data?.meta)} noun="completed task" className="mt-sm" />
    </Card>
  )
}

function CompletedRow({ task }: { task: ActivityTask }) {
  return (
    <div className="flex items-center gap-md border-b border-border py-xs last:border-0">
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
          {personName(task.assigned_to)} · assigned by {personName(task.assigned_by)} · Due {formatDate(task.due_date)}
        </p>
      </div>
      <Badge color="success">{task.completed_at ? `Completed ${formatDate(task.completed_at)}` : 'Done'}</Badge>
    </div>
  )
}

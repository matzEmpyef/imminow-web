import { Drawer } from '@/components/Drawer'
import { Badge } from '@/components/Badge'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { SIGN_IN_HISTORY_LIMIT, useUserSignIns } from '@/queries/adminUserDirectories'
import { formatDate, formatDateTime } from '@/lib/time'
import { SIGN_IN_METHOD_LABELS, SIGN_IN_OUTCOME_LABELS, SIGN_IN_PLATFORM_LABELS } from '@/lib/signIns'

export interface SignInHistoryPerson {
  id: string
  name: string
  email: string
}

type History = NonNullable<ReturnType<typeof useUserSignIns>['data']>
type Attempt = History['items'][number]

// Opened from a row in Sentpo Users or immiNow Users (user, 2026-09-10: "add sign-in history").
// Built for two questions: support's "why can't they get in" (each failure's reason, in plain
// words) and security's "was that them" (the device and address each attempt came from).
export function SignInHistoryDrawer({ person, onClose }: { person: SignInHistoryPerson | null; onClose: () => void }) {
  const history = useUserSignIns(person?.id ?? null)

  return (
    <Drawer open={person != null} onClose={onClose} title="Sign-in history">
      {person && (
        <div className="flex flex-col gap-md">
          <div>
            <p className="font-medium text-text-primary">{person.name}</p>
            <p className="text-caption text-text-secondary">{person.email}</p>
          </div>
          {history.isLoading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : history.isError || !history.data ? (
            <ErrorState message="Could not load sign-in history." onRetry={() => history.refetch()} />
          ) : (
            <HistoryBody data={history.data} />
          )}
        </div>
      )}
    </Drawer>
  )
}

function HistoryBody({ data }: { data: History }) {
  const { summary, items } = data
  return (
    <div className="flex flex-col gap-md">
      <div className="grid grid-cols-2 gap-sm rounded-md border border-border p-sm">
        <div className="flex flex-col gap-xs">
          <span className="text-caption text-text-secondary">Last successful sign-in</span>
          <span className="text-body-sm font-medium text-text-primary">
            {summary.last_success_at ? formatDateTime(summary.last_success_at) : 'None recorded'}
          </span>
        </div>
        <div className="flex flex-col gap-xs">
          <span className="text-caption text-text-secondary">Failed, last {summary.failures_recent_days} days</span>
          <span className={`text-body-sm font-medium tabular-nums ${summary.failures_recent > 0 ? 'text-error' : 'text-text-primary'}`}>
            {summary.failures_recent}
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          No sign-in attempts recorded since {formatDate(summary.recording_since)}. Reopening the app on a saved session isn't a
          sign-in, so someone who stays signed in can have none.
        </p>
      ) : (
        <ol className="flex flex-col">
          {items.map((a) => (
            <AttemptRow key={a.id} attempt={a} />
          ))}
        </ol>
      )}

      <p className="text-caption text-text-secondary">
        {data.meta.next_cursor ? `Showing the ${SIGN_IN_HISTORY_LIMIT} most recent attempts. ` : ''}
        Recorded since {formatDate(summary.recording_since)}.
      </p>
    </div>
  )
}

function AttemptRow({ attempt }: { attempt: Attempt }) {
  const ok = attempt.outcome === 'success'
  const device = [
    attempt.platform ? SIGN_IN_PLATFORM_LABELS[attempt.platform] ?? attempt.platform : null,
    attempt.app_version,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <li className="flex flex-col gap-xs border-b border-border py-sm last:border-b-0">
      <div className="flex items-center justify-between gap-sm">
        <Badge color={ok ? 'success' : 'warning'}>{SIGN_IN_OUTCOME_LABELS[attempt.outcome] ?? attempt.outcome}</Badge>
        <span className="text-caption tabular-nums text-text-secondary">{formatDateTime(attempt.occurred_at)}</span>
      </div>
      <p className="text-caption text-text-secondary">
        {[SIGN_IN_METHOD_LABELS[attempt.method] ?? attempt.method, device || 'Device not reported', attempt.ip ? `IP ${attempt.ip}` : null]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </li>
  )
}

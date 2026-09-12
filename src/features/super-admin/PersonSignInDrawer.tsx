import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Drawer } from '@/components/Drawer'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { SIGN_IN_HISTORY_LIMIT, useSignOutEverywhere, useUserSignIns } from '@/queries/adminUserDirectories'
import { api } from '@/api/client'
import { ApiError } from '@/queries/auth'
import { formatDate, formatDateTime } from '@/lib/time'
import { showToast } from '@/lib/toast'
import { SIGN_IN_METHOD_LABELS, SIGN_IN_OUTCOME_LABELS, SIGN_IN_PLATFORM_LABELS } from '@/lib/signIns'

/**
 * Sign-in history plus two record-management actions (review M9, 2026-09-12).
 *
 * A near-duplicate of `SignInHistoryDrawer.tsx` on purpose rather than an edit to it: this session
 * was scoped to a fixed file list that doesn't include that shared component (another agent owns
 * the rest of the console concurrently), so extending it here — the same "create new files next to
 * the ones you own" allowance the task gave for exports — is what stays inside that boundary. The
 * history body/attempt rendering (`HistoryBody`/`AttemptRow` below) is copied rather than imported
 * for the same reason: the original doesn't export them. If `SignInHistoryDrawer.tsx` becomes
 * editable in a later session, the two should be folded back into one.
 */
export interface SignInHistoryPerson {
  id: string
  name: string
  email: string
  /** Which directory this person came from — drives "Go to record" below. */
  kind: 'student' | 'consultancy_staff' | 'platform_staff'
  /** consultancy_staff only. */
  consultancyName?: string | null
  /** student only — whether they've committed to a consultancy, i.e. have a case to open. */
  hasCase?: boolean
}

type History = NonNullable<ReturnType<typeof useUserSignIns>['data']>
type Attempt = History['items'][number]

/**
 * "Go to record" — jumps from a sign-in lookup to the fuller record it was probably for. Platform
 * and consultancy staff carry enough on their own directory row already; a student does not — the
 * Sentpo directory has no journey_id, only `consultancy_name`/`journey_stage` (see
 * SentpoUserDirectoryRow) — so this looks it up on demand via the same `/users/search` Support
 * Tools and Create Account already use. That endpoint is gated on the `support` permission,
 * distinct from the `user_directory` permission that gates this whole drawer, so a viewer with one
 * but not the other sees the inline error below rather than a silent failure.
 */
function GoToRecordAction({ person }: { person: SignInHistoryPerson }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const linkClass = 'text-caption font-medium text-primary hover:underline'

  if (person.kind === 'platform_staff') {
    return (
      <Link to="/admin/platform-team" className={linkClass}>
        Go to record
      </Link>
    )
  }
  if (person.kind === 'consultancy_staff') {
    if (!person.consultancyName) return null
    return (
      <Link to={`/admin/consultancies?search=${encodeURIComponent(person.consultancyName)}`} className={linkClass}>
        Go to record
      </Link>
    )
  }
  // student
  if (!person.hasCase) return null

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: apiError } = await api.GET('/users/search', { params: { query: { q: person.email } } })
      if (apiError) throw new ApiError('Could not look up this student.', apiError)
      const match = data?.items?.find((u) => u.id === person.id) ?? data?.items?.find((u) => u.journey_id)
      if (match?.journey_id) {
        navigate(`/admin/applicants/${match.journey_id}`)
      } else {
        setError("Could not find this student's case.")
      }
    } catch {
      setError("Could not find this student's case.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-xs">
      <button type="button" onClick={handleClick} disabled={loading} className={linkClass}>
        {loading ? 'Looking up…' : 'Go to record'}
      </button>
      {error && <span className="text-caption text-error">{error}</span>}
    </div>
  )
}

/** "Sign out everywhere" — ends every active session without touching the account itself; they
 * can sign back in right away. Confirms first since it's disruptive mid-work. */
function SignOutEverywhereAction({ person }: { person: SignInHistoryPerson }) {
  const [confirming, setConfirming] = useState(false)
  const signOut = useSignOutEverywhere()

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-caption font-medium text-primary hover:underline"
      >
        Sign out everywhere
      </button>
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Sign out everywhere"
          widthRem={26}
          footer={
            <>
              {signOut.isError && <p className="mr-auto self-center text-body-sm text-error">{signOut.error.message}</p>}
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={signOut.isPending}
                onClick={() =>
                  signOut.mutate(person.id, {
                    onSuccess: () => {
                      setConfirming(false)
                      showToast(`${person.name} signed out everywhere`)
                    },
                  })
                }
              >
                Sign out
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-primary">
            End every active session for <span className="font-medium">{person.name}</span>? This doesn&rsquo;t lock the
            account — they can sign back in right away.
          </p>
        </Modal>
      )}
    </>
  )
}

export function PersonSignInDrawer({ person, onClose }: { person: SignInHistoryPerson | null; onClose: () => void }) {
  const history = useUserSignIns(person?.id ?? null)

  return (
    <Drawer open={person != null} onClose={onClose} title="Sign-in history" dismissible>
      {person && (
        <div className="flex flex-col gap-md">
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <p className="font-medium text-text-primary">{person.name}</p>
              <p className="text-caption text-text-secondary">{person.email}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-xs">
              <GoToRecordAction person={person} />
              <SignOutEverywhereAction person={person} />
            </div>
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

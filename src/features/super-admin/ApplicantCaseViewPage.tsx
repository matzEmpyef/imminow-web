import { useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { CountryLabel } from '@/components/CountryLabel'
import { AdminShell } from '@/features/auth/AdminShell'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { ApiError } from '@/queries/auth'
import { useAuthStore } from '@/stores/authStore'
import { formatDate, relativeTime } from '@/lib/time'
import { useCaseNotes, useRecordFollowup, type CaseFollowupOutcome } from '@/queries/caseFollowups'
import { LogCallModal, type LogCallInput } from './followups/LogCallModal'
import { CASE_OUTCOME_OPTIONS, OUTCOME_LABELS } from './followups/labels'
import { showToast } from '@/lib/toast'

function useApplicantCase(journeyId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['admin', 'applicants', journeyId],
    queryFn: async () => {
      const { data, error } = await api.GET('/admin/applicants/{id}', {
        params: { path: { id: journeyId! } },
      })
      if (error) throw new ApiError('Could not load this applicant.', error)
      return data
    },
    enabled: isAuthed && Boolean(journeyId),
  })
}

/**
 * Where a given applicant actually is (2026-09-09).
 *
 * Platform staff previously had the allocation queue and a switch-consultancy button and nothing
 * else, so anyone mediating a dispute or chasing a payment was deciding blind — and a consultancy
 * 80% of the way through a case has a very different claim from one that never started.
 *
 * DELIBERATELY SHOWS NO DOCUMENTS AND NO CHAT. The student's locker is theirs, shared with a
 * consultancy by an explicit grant; the platform is not a party to those grants and does not get a
 * back door to them. Chat is out for the same reason — it is the consultancy's own record with
 * their client.
 */
export function ApplicantCaseViewPage() {
  const { id } = useParams<{ id: string }>()
  // Opened from Payment follow-ups this page lives under /admin/case-followups/, so the sidebar
  // keeps Finance highlighted; links onward stay under whichever section you came in from.
  const base = useLocation().pathname.startsWith('/admin/case-followups/') ? '/admin/case-followups' : '/admin/applicants'
  const applicant = useApplicantCase(id)
  // Log a call + call history (2026-09-12, product review H6) — this page had neither, so working
  // a case from here meant going back to the queue just to record a call. Same modal, same
  // endpoint (POST /clients/{id}/followups) as the Payment follow-ups list.
  const notes = useCaseNotes(id ?? null)
  const record = useRecordFollowup()
  const [logging, setLogging] = useState(false)

  if (applicant.isLoading) {
    return (
      <AdminShell>
        <Skeleton className="h-40 rounded-lg" />
      </AdminShell>
    )
  }
  if (applicant.isError || !applicant.data) {
    return (
      <AdminShell>
        <ErrorState message="Could not load this applicant." onRetry={() => applicant.refetch()} />
      </AdminShell>
    )
  }

  const data = applicant.data
  // "Due since" once the balance has settled to ₹0 read as still-outstanding money on a balance
  // that no longer exists (L8, product review 2026-09-12) — null renders nothing at all rather
  // than a misleading date.
  const commission = data.commission
  const statusLine = commission
    ? commission.reversed_at
      ? `Reversed ${formatDate(commission.reversed_at)}`
      : commission.recognized_at && (commission.platform_due_inr ?? 0) > 0
        ? `Due since ${formatDate(commission.recognized_at)}`
        : commission.recognized_at
          ? null
          : 'Earned on paper — not due until the case closes'
    : null

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">
            {data.student?.name}
            {data.file_number && (
              <span className="ml-sm text-body-sm font-normal text-text-secondary">{data.file_number}</span>
            )}
          </h1>
          <p className="text-body-sm text-text-secondary">
            {data.consultancy_name ? (
              <Link
                to={`/admin/consultancies?search=${encodeURIComponent(data.consultancy_name)}`}
                className="text-primary hover:underline"
              >
                {data.consultancy_name}
              </Link>
            ) : (
              '—'
            )}{' '}
            &middot;{' '}
            {data.consultant_name ? (
              <Link
                to={`/admin/users/imminow?search=${encodeURIComponent(data.consultant_name)}`}
                className="text-primary hover:underline"
              >
                {data.consultant_name}
              </Link>
            ) : (
              'unassigned'
            )}{' '}
            &middot; {data.status?.replace(/_/g, ' ')}
            {data.outcome && <span> &middot; {data.outcome}</span>}
            {data.previous_journey_id && (
              <>
                {' '}&middot;{' '}
                <Link to={`${base}/${data.previous_journey_id}`} className="text-primary hover:underline">
                  returning
                </Link>
              </>
            )}
          </p>
        </div>

        {data.signals && data.signals.length > 0 && (
          <Card className="flex flex-col gap-xs border-l-4 border-l-warning">
            <p className="text-body font-medium text-text-primary">Why this case is flagged</p>
            {data.signals.map((s) => (
              <p key={s.code} className="text-body-sm text-text-secondary">
                <strong className="text-text-primary">{s.label}</strong> — {s.detail}
              </p>
            ))}
          </Card>
        )}

        <div className="grid grid-cols-2 gap-md">
          <Card className="flex flex-col gap-xs">
            <h2 className="text-h3 text-text-primary">Contact</h2>
            <p className="text-body-sm text-text-secondary">{data.student?.email}</p>
            <p className="text-body-sm text-text-secondary">{data.student?.phone ?? '—'}</p>
            <p className="text-caption text-text-secondary">
              Started {formatDate(data.created_at!)} &middot; {data.days_since_started} days ago
              {data.closed_at && <> &middot; closed {formatDate(data.closed_at)}</>}
            </p>
          </Card>

          <Card className="flex flex-col gap-xs">
            <h2 className="text-h3 text-text-primary">Money</h2>
            {data.commission ? (
              <>
                <p className="text-body-sm text-text-secondary">
                  Platform due ₹{(data.commission.platform_due_inr ?? 0).toLocaleString('en-IN')}
                </p>
                {/* The line between earned and due. An entry with no recognised date is money on
                    paper that nobody owes yet. "Due since" is meaningless once the due amount has
                    settled to ₹0 (product review, 2026-09-12) — it read as still-outstanding money
                    on a balance that no longer exists, so that case shows nothing here at all. */}
                {statusLine && <p className="text-body-sm text-text-secondary">{statusLine}</p>}
              </>
            ) : (
              <p className="text-body-sm text-text-secondary">No commission entry — no college accepted yet.</p>
            )}
          </Card>
        </div>

        <Card className="flex flex-col gap-sm">
          <h2 className="text-h3 text-text-primary">Applications</h2>
          {data.applications?.length === 0 && (
            <p className="text-body-sm text-text-secondary">No colleges on this case.</p>
          )}
          {data.applications?.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-md">
              <div>
                <p className="text-body-sm text-text-primary">{a.college_name ?? 'College'}</p>
                <p className="text-caption text-text-secondary">
                  {a.course_name}
                  {a.country && (
                    <>
                      {' '}&middot; <CountryLabel name={a.country} />
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-sm">
                <Badge color="secondary">{a.status?.replace(/_/g, ' ')}</Badge>
                <span className="text-caption text-text-secondary">
                  {a.days_since_status_change ?? '—'}d
                </span>
              </div>
            </div>
          ))}
        </Card>

        <Card className="flex flex-col gap-sm">
          <h2 className="text-h3 text-text-primary">Plans</h2>
          {data.plans?.map((p) => (
            <div key={p.id} className="flex items-center justify-between">
              <span className="text-body-sm text-text-primary">
                {p.scope === 'case' ? 'Case plan' : (p.college_name ?? 'College plan')}
              </span>
              <span className="text-body-sm tabular-nums text-text-secondary">{p.progress}</span>
            </div>
          ))}
        </Card>

        <Card className="flex flex-col gap-sm">
          <div className="flex items-center justify-between gap-md">
            <h2 className="text-h3 text-text-primary">Call history</h2>
            <Button size="sm" onClick={() => setLogging(true)}>
              Log a call
            </Button>
          </div>
          {notes.isLoading && <Skeleton className="h-16 rounded-md" />}
          {notes.isError && <ErrorState message="Could not load the call history." onRetry={() => notes.refetch()} />}
          {!notes.isLoading && !notes.isError && (notes.data?.length ?? 0) === 0 && (
            <p className="text-body-sm text-text-secondary">Nobody has reached out yet.</p>
          )}
          {!notes.isLoading && !notes.isError && notes.data && notes.data.length > 0 && (
            <ol className="flex flex-col">
              {notes.data.map((n) => (
                <li key={n.id} className="flex flex-col gap-xs border-b border-border py-sm last:border-b-0">
                  <div className="flex items-center justify-between gap-sm">
                    <span className="text-body-sm font-medium text-text-primary">{n.author_name ?? 'Someone'}</span>
                    <span className="text-caption tabular-nums text-text-secondary">{relativeTime(n.created_at)}</span>
                  </div>
                  <p className="text-body-sm text-text-primary">{n.note}</p>
                  {(n.outcome || n.call_back_on) && (
                    <div className="flex flex-wrap items-center gap-xs">
                      {n.outcome && <Badge color="info">{OUTCOME_LABELS[n.outcome] ?? n.outcome}</Badge>}
                      {n.call_back_on && (
                        <span className="text-caption text-text-secondary">Call back {formatDate(n.call_back_on)}</span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>

        <p className="text-caption text-text-secondary">
          Documents and chat are not shown here. The student&rsquo;s documents are shared with their consultancy by
          their own grant, and their conversation is the consultancy&rsquo;s record with them.
        </p>
      </div>

      {logging && id && (
        <LogCallModal
          title={`Log a call — ${data.student?.name ?? 'this student'}`}
          outcomeOptions={CASE_OUTCOME_OPTIONS}
          pending={record.isPending}
          errorMessage={record.isError ? record.error.message : undefined}
          onClose={() => setLogging(false)}
          onSave={(input: LogCallInput) =>
            record.mutate(
              {
                journeyId: id,
                note: input.note,
                outcome: input.outcome as CaseFollowupOutcome | undefined,
                callBackOn: input.callBackOn,
              },
              {
                onSuccess: () => {
                  setLogging(false)
                  showToast(`Call logged for ${data.student?.name ?? 'this student'}`)
                },
              },
            )
          }
        />
      )}
    </AdminShell>
  )
}

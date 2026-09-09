import { useParams, Link } from 'react-router-dom'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { AdminShell } from '@/features/auth/AdminShell'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { ApiError } from '@/queries/auth'
import { useAuthStore } from '@/stores/authStore'
import { formatDate } from '@/lib/time'

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
  const applicant = useApplicantCase(id)

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
            {data.consultancy_name} &middot; {data.consultant_name ?? 'unassigned'} &middot;{' '}
            {data.status?.replace(/_/g, ' ')}
            {data.outcome && <span> &middot; {data.outcome}</span>}
            {data.previous_journey_id && (
              <>
                {' '}&middot;{' '}
                <Link to={`/admin/applicants/${data.previous_journey_id}`} className="text-primary hover:underline">
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
                    paper that nobody owes yet. */}
                <p className="text-body-sm text-text-secondary">
                  {data.commission.reversed_at
                    ? `Reversed ${formatDate(data.commission.reversed_at)}`
                    : data.commission.recognized_at
                      ? `Due since ${formatDate(data.commission.recognized_at)}`
                      : 'Earned on paper — not due until the case closes'}
                </p>
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
                  {a.country && <> &middot; {a.country}</>}
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

        <p className="text-caption text-text-secondary">
          Documents and chat are not shown here. The student&rsquo;s documents are shared with their consultancy by
          their own grant, and their conversation is the consultancy&rsquo;s record with them.
        </p>
      </div>
    </AdminShell>
  )
}

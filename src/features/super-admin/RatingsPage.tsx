import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { FilterChip } from '@/components/FilterChip'
import { StarRating } from '@/components/StarRating'
import { StopPropagation } from '@/components/StopPropagation'
import { Table, type TableColumn } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'
import { useAdminRatings, type AdminRating } from '@/queries/adminRatings'
import { ConsultancySearchSelect } from './finance/ConsultancySearchSelect'
import { RatingDrawer } from './RatingDrawer'
import { RatingFlagBadges } from './ratingShared'
import { channelLabel, formatStars } from './ratingWords'

type View = 'all' | 'flagged' | 'excluded'

const EMPTY_MESSAGE: Record<View, string> = {
  all: 'No ratings yet.',
  flagged: 'No ratings with a signal.',
  excluded: 'No excluded ratings.',
}

const LIMIT = 20

/**
 * Platform Ratings (owner decision 16, review F-012): every student's rating of a consultancy,
 * most recently rated first, with the signals that suggest a rating was manufactured. Same
 * Consultancies permission (`consultancy_approval`) and the same chips-over-a-table shape as the
 * Reviews queue beside it. A row opens the full record, where a rating can be taken out of the
 * consultancy's score or put back.
 *
 * `?student_id=` shows everything one account rated — where "Open rating" in the review drawer
 * lands. It is an id, never a name, so nothing personal is put in the address.
 */
export function RatingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const studentId = searchParams.get('student_id') ?? ''
  const [view, setView] = useState<View>('all')
  const [consultancyId, setConsultancyId] = useState('')
  const paging = useCursorPagination()
  const ratings = useAdminRatings({
    consultancy_id: consultancyId || undefined,
    student_id: studentId || undefined,
    flagged: view === 'flagged' ? true : undefined,
    excluded: view === 'excluded' ? true : undefined,
    limit: LIMIT,
    cursor: paging.cursor,
  })
  const [viewingId, setViewingId] = useState<string | null>(null)
  // The drawer shows what an action just returned until the list has refetched and carries it.
  const [updated, setUpdated] = useState<AdminRating | null>(null)

  const rows = ratings.data?.items ?? []
  const counts = ratings.data?.counts
  const nextCursor = ratings.data?.meta.next_cursor
  const viewing = viewingId ? (updated?.id === viewingId ? updated : (rows.find((r) => r.id === viewingId) ?? null)) : null

  function changeView(next: View) {
    setView(next)
    paging.reset()
  }

  function clearStudent() {
    const next = new URLSearchParams(searchParams)
    next.delete('student_id')
    setSearchParams(next, { replace: true })
    paging.reset()
  }

  const chips: { key: View; label: string; count: number | undefined }[] = [
    { key: 'all', label: 'All', count: counts ? counts.included + counts.excluded : undefined },
    { key: 'flagged', label: 'Flagged', count: counts?.flagged },
    { key: 'excluded', label: 'Excluded', count: counts?.excluded },
  ]

  const columns: TableColumn<AdminRating>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <div className="min-w-0">
          <p className={`truncate font-medium ${r.student_name ? 'text-text-primary' : 'text-text-secondary'}`}>
            {r.student_name ?? 'Erased account'}
          </p>
          {r.student_account_created_at && (
            <p className="truncate text-caption text-text-secondary">
              account created {formatDate(r.student_account_created_at)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'consultancy',
      header: 'Consultancy',
      hideBelow: 'sm',
      render: (r) => (
        <StopPropagation>
          <Link
            to={`/admin/consultancies?search=${encodeURIComponent(r.consultancy_name)}`}
            className="text-primary hover:underline"
          >
            {r.consultancy_name}
          </Link>
        </StopPropagation>
      ),
    },
    {
      key: 'stars',
      header: 'Rating',
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <StarRating value={r.stars} />
          <span className="whitespace-nowrap text-caption text-text-secondary">
            {formatStars(r.stars)} · {r.submissions} {r.submissions === 1 ? 'submission' : 'submissions'}
          </span>
        </div>
      ),
    },
    {
      key: 'relationship',
      header: 'Relationship',
      hideBelow: 'md',
      render: (r) => (
        <span className="whitespace-nowrap text-text-secondary">
          {r.relationship === 'client' ? ['Client', channelLabel(r.acquisition_source)].filter(Boolean).join(' · ') : 'Chat'}
        </span>
      ),
    },
    {
      key: 'flags',
      header: 'Signals',
      render: (r) =>
        r.flags.length > 0 ? <RatingFlagBadges flags={r.flags} /> : <span className="text-text-secondary">—</span>,
    },
    {
      key: 'rated',
      header: 'Rated',
      hideBelow: 'lg',
      render: (r) => <span className="whitespace-nowrap text-text-secondary">{formatDate(r.last_rated_at)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <div className="flex flex-col items-start gap-0.5">
          {r.excluded ? <Badge color="error">Excluded</Badge> : <Badge color="success">Included</Badge>}
          {r.rated_again_since_exclusion && (
            <span className="whitespace-nowrap text-caption text-warning">rated again since</span>
          )}
        </div>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Ratings</h1>
          <p className="text-body-sm text-text-secondary">
            Every student&rsquo;s rating of a consultancy, one per student. Excluding a rating takes it out of the
            consultancy&rsquo;s score; the student is not told.
          </p>
        </div>

        <Table
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={ratings.isLoading}
          error={ratings.isError ? ratings.error.message : undefined} errorSource={ratings.error}
          emptyMessage={studentId ? 'This account has not rated anyone.' : EMPTY_MESSAGE[view]}
          onRowClick={(r) => {
            setUpdated(null)
            setViewingId(r.id)
          }}
          filters={
            <ConsultancySearchSelect
              value={consultancyId}
              onChange={(id) => {
                setConsultancyId(id)
                paging.reset()
              }}
            />
          }
          quickFilters={
            <>
              {studentId && (
                <button
                  type="button"
                  onClick={clearStudent}
                  className="flex h-8 items-center gap-xs rounded-full border border-primary bg-primary/10 px-3 text-caption font-medium text-primary"
                >
                  Ratings by one account
                  <X className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">Show all accounts</span>
                </button>
              )}
              {chips.map((chip) => (
                <FilterChip
                  key={chip.key}
                  label={chip.count != null ? `${chip.label} (${chip.count})` : chip.label}
                  active={view === chip.key}
                  onChange={() => changeView(chip.key)}
                />
              ))}
            </>
          }
          pagination={{
            hasNext: Boolean(nextCursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => nextCursor && paging.next(nextCursor),
            onPrevious: paging.previous,
            total: ratings.data?.meta.total,
            totalCapped: ratings.data?.meta.total_capped,
          }}
        />
      </div>

      {viewing && (
        <RatingDrawer
          rating={viewing}
          onClose={() => {
            setViewingId(null)
            setUpdated(null)
          }}
          onUpdated={setUpdated}
        />
      )}
    </AdminShell>
  )
}

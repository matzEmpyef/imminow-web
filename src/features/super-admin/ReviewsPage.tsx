import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '@/features/auth/AdminShell'
import { FilterChip } from '@/components/FilterChip'
import { StarRating } from '@/components/StarRating'
import { StopPropagation } from '@/components/StopPropagation'
import { Table, type TableColumn } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'
import { useAdminReviews, type Review } from '@/queries/adminReviews'
import { ReviewDrawer } from './ReviewDrawer'
import { RatingFlagBadges } from './ratingShared'

const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'published', label: 'Published' },
  { key: 'hidden', label: 'Hidden' },
] as const
type StatusKey = (typeof STATUS_TABS)[number]['key']

const EMPTY_MESSAGE: Record<StatusKey, string> = {
  pending: 'No reviews waiting.',
  published: 'No published reviews yet.',
  hidden: 'No hidden reviews.',
}

const LIMIT = 20

/**
 * Platform Reviews moderation (2026-09-12) — the pre-moderation queue for every review a student
 * writes about their consultancy. Same Consultancies permission (`consultancy_approval`) and same
 * tabbed-status-queue shape as ComplaintsPage, now also cursor-paginated like it (contract gate 10b
 * item 8 switched this from limit/offset to the console's usual cursor pattern).
 */
export function ReviewsPage() {
  const [status, setStatus] = useState<StatusKey>('pending')
  const paging = useCursorPagination()
  const reviews = useAdminReviews({ status, limit: LIMIT, cursor: paging.cursor })
  const [viewing, setViewing] = useState<Review | null>(null)

  const rows = reviews.data?.items ?? []
  const counts = reviews.data?.counts
  const nextCursor = reviews.data?.meta.next_cursor

  function changeStatus(next: StatusKey) {
    setStatus(next)
    paging.reset()
  }

  const columns: TableColumn<Review>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-text-primary">{r.student_name}</p>
          <p className="truncate text-caption text-text-secondary">
            {[r.study_level, r.target_country].filter(Boolean).join(' · ') || '—'}
          </p>
          {/* The signals on the rating behind this review, so a doubtful one stands out in the queue. */}
          {(r.flags?.length ?? 0) > 0 && (
            <div className="mt-0.5">
              <RatingFlagBadges flags={r.flags} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'consultancy',
      header: 'Consultancy',
      hideBelow: 'sm',
      render: (r) =>
        r.consultancy_name ? (
          <StopPropagation>
            <Link
              to={`/admin/consultancies?search=${encodeURIComponent(r.consultancy_name)}`}
              className="text-primary hover:underline"
            >
              {r.consultancy_name}
            </Link>
          </StopPropagation>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    {
      key: 'stars',
      header: 'Rating',
      render: (r) => (r.stars != null ? <StarRating value={r.stars} /> : <span className="text-text-secondary">—</span>),
    },
    {
      key: 'text',
      header: 'Review',
      render: (r) => <p className="line-clamp-2 text-text-primary" style={{ maxWidth: '24rem' }}>{r.text}</p>,
    },
    {
      key: 'submitted',
      header: 'Submitted',
      hideBelow: 'md',
      render: (r) => <span className="whitespace-nowrap text-text-secondary">{formatDate(r.created_at)}</span>,
    },
    {
      key: 'moderation',
      header: status === 'hidden' ? 'Hidden' : 'Moderated',
      hideBelow: 'lg',
      render: (r) =>
        r.moderated_at ? (
          <div className="flex flex-col">
            <span className="whitespace-nowrap text-text-secondary">
              {r.moderated_by_name ?? 'Someone'} · {formatDate(r.moderated_at)}
            </span>
            {status === 'hidden' && r.hidden_reason && (
              <span className="truncate text-caption text-text-secondary" style={{ maxWidth: '16rem' }}>
                {r.hidden_reason}
              </span>
            )}
          </div>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Reviews</h1>
          <p className="text-body-sm text-text-secondary">
            Every review a student writes lands here first. Nothing shows in the app until it is published.
          </p>
        </div>

        <Table
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={reviews.isLoading}
          error={reviews.isError ? 'Could not load reviews.' : undefined} errorSource={reviews.error}
          emptyMessage={EMPTY_MESSAGE[status]}
          onRowClick={(r) => setViewing(r)}
          quickFilters={
            <>
              {STATUS_TABS.map((tab) => (
                <FilterChip
                  key={tab.key}
                  label={counts ? `${tab.label} (${counts[tab.key] ?? 0})` : tab.label}
                  active={status === tab.key}
                  onChange={() => changeStatus(tab.key)}
                />
              ))}
            </>
          }
          pagination={{
            hasNext: Boolean(nextCursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => nextCursor && paging.next(nextCursor),
            onPrevious: paging.previous,
            total: reviews.data?.meta.total,
            totalCapped: reviews.data?.meta.total_capped,
          }}
        />
      </div>

      {viewing && (
        <ReviewDrawer review={viewing} onClose={() => setViewing(null)} onUpdated={(updated) => setViewing(updated)} />
      )}
    </AdminShell>
  )
}

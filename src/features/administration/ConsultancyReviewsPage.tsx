import { useState } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { StarRating } from '@/components/StarRating'
import { Table, type TableColumn } from '@/components/Table'
import { formatDate } from '@/lib/time'
import { useMyReviews } from '@/queries/consultancyReviews'
import type { components } from '@/api/schema'

type Review = components['schemas']['Review']

const LIMIT = 20

// Five bars, 5 stars down to 1 — the same shape every "rating breakdown" widget uses. Since owner
// decision 16 (review F-012) the buckets are the students' RATINGS, one per student (each rounded
// to a whole star), so the widths are worked out against `rating_count`, which they sum to.
function DistributionBars({ distribution, total }: { distribution: Record<string, number>; total: number }) {
  return (
    <div className="flex flex-col gap-xs" style={{ minWidth: '14rem' }}>
      {[5, 4, 3, 2, 1].map((star) => {
        const count = distribution[String(star)] ?? 0
        const pct = total > 0 ? Math.round((count / total) * 100) : 0
        return (
          <div key={star} className="flex items-center gap-sm">
            <span className="w-3 shrink-0 text-caption text-text-secondary">{star}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
              <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-6 shrink-0 text-right text-caption text-text-secondary">{count}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Read-only Reviews page for the consultancy console (2026-09-12) — Consultancy Management area,
 * same PermissionGate as Consultancy Profile (`settings.edit_profile`). Nothing here is editable:
 * every review shown already cleared the platform's moderation queue (ReviewsPage.tsx, super-admin
 * side) before it could appear.
 */
export function ConsultancyReviewsPage() {
  const [offset, setOffset] = useState(0)
  const reviews = useMyReviews({ limit: LIMIT, offset })

  if (reviews.isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 rounded-lg" />
      </AppShell>
    )
  }

  if (reviews.isError || !reviews.data) {
    return (
      <AppShell>
        <ErrorState message="Could not load reviews." onRetry={() => reviews.refetch()} />
      </AppShell>
    )
  }

  const { summary, items, total } = reviews.data

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
        </div>
      ),
    },
    {
      key: 'stars',
      header: 'Rating',
      // A review can outlive its rating (the student's account was erased): no stars to show then.
      render: (r) => (r.stars != null ? <StarRating value={r.stars} /> : <span className="text-text-secondary">—</span>),
    },
    {
      key: 'text',
      header: 'Review',
      render: (r) => <p className="whitespace-pre-wrap text-text-primary">{r.text}</p>,
    },
    {
      key: 'date',
      header: 'Date',
      align: 'right',
      hideBelow: 'sm',
      render: (r) => <span className="whitespace-nowrap text-text-secondary">{formatDate(r.created_at)}</span>,
    },
  ]

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Reviews</h1>
          <p className="text-body-sm text-text-secondary">
            Students rate you from their chat once you have talked enough, and may write a review when their case
            ends. Each student counts once. Sentpo checks every written review before it appears. Contact support if
            a review breaks the rules.
          </p>
        </div>

        <div className="flex flex-col gap-lg rounded-lg bg-surface p-lg shadow-card sm:flex-row sm:items-center">
          <div className="flex flex-col items-start gap-xs">
            {/* The score appears once the server gives one. Until then (no ratings yet, or too few
                for a score) it says so in words; why, and how many it takes, is never stated. */}
            {summary.rating != null ? (
              <>
                <span className="text-display text-text-primary">{summary.rating.toFixed(1)}</span>
                <StarRating value={summary.rating} />
              </>
            ) : (
              <span className="text-h2 text-text-primary">Not rated yet</span>
            )}
            <span className="text-caption text-text-secondary">
              from {summary.rating_count} {summary.rating_count === 1 ? 'student' : 'students'} · {summary.review_count}{' '}
              written {summary.review_count === 1 ? 'review' : 'reviews'}
            </span>
          </div>
          {/* H11 (2026-09-13): the bars must say which set they plot. They now plot every counted
              student rating (review F-012), the same set the number beside them is the average of. */}
          <div className="flex flex-col gap-xs">
            <p className="text-body-sm font-medium text-text-primary">Ratings by star</p>
            <DistributionBars distribution={summary.distribution} total={summary.rating_count} />
            <p className="text-caption text-text-secondary">
              Each student counts once; written reviews show that student&rsquo;s rating.
            </p>
          </div>
        </div>

        <Table
          columns={columns}
          rows={items}
          rowKey={(r) => r.id}
          emptyMessage="No published reviews yet."
          pagination={{
            hasNext: offset + LIMIT < total,
            hasPrevious: offset > 0,
            onNext: () => setOffset((o) => o + LIMIT),
            onPrevious: () => setOffset((o) => Math.max(0, o - LIMIT)),
            total,
          }}
        />
      </div>
    </AppShell>
  )
}

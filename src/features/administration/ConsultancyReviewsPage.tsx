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

// Five bars, 5 stars down to 1 — the same shape every "rating breakdown" widget uses. Percentage
// widths are computed against the published review count, not rating_count (star-only ratings from
// the cooldown-gated Stage 1 flow have no star bucket here since there's no written review to list).
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
    { key: 'stars', header: 'Rating', render: (r) => <StarRating value={r.stars} /> },
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
            Reviews are written once by students after their plan completes and checked by Sentpo before they
            appear. Contact support if a review breaks the rules.
          </p>
        </div>

        <div className="flex flex-col gap-lg rounded-lg bg-surface p-lg shadow-card sm:flex-row sm:items-center">
          <div className="flex flex-col items-start gap-xs">
            <span className="text-display text-text-primary">
              {summary.rating != null ? summary.rating.toFixed(1) : '—'}
            </span>
            {summary.rating != null && <StarRating value={summary.rating} />}
            <span className="text-caption text-text-secondary">
              from {summary.rating_count} {summary.rating_count === 1 ? 'rating' : 'ratings'} · {summary.review_count}{' '}
              written {summary.review_count === 1 ? 'review' : 'reviews'}
            </span>
          </div>
          <DistributionBars distribution={summary.distribution} total={summary.review_count} />
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

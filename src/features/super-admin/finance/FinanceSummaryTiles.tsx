import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/QueryState'
import type { FinanceSummary } from '@/queries/financeDashboard'

function inr(n: number | undefined): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

/**
 * Overview's four glance tiles (2026-09-11 rebuild) — Outstanding, Awaiting confirmation,
 * Received this month, and Collected-vs-expected. Small cards, not full Card components, to match
 * the strip pattern the follow-up queues use above their tables (feedback_platform_wide_consistency).
 */
export function FinanceSummaryTiles({
  summary,
  loading,
  onAwaitingClick,
  onOverdueClick,
}: {
  summary?: FinanceSummary
  loading?: boolean
  onAwaitingClick: () => void
  onOverdueClick: () => void
}) {
  if (loading || !summary) {
    return (
      <div className="flex flex-wrap gap-sm">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 flex-1 basis-56 rounded-md" />
        ))}
      </div>
    )
  }

  const overdue = summary.overdue_inr ?? 0

  const collectedPercent =
    summary.expected_inr > 0 ? Math.min(100, Math.round((summary.collected_inr / summary.expected_inr) * 100)) : 0

  return (
    <div className="flex flex-wrap gap-sm">
      <div className="flex flex-1 basis-56 flex-col gap-xs rounded-md border border-border bg-surface px-md py-sm">
        <span className="text-caption text-text-secondary">Outstanding</span>
        <span className="text-h3 tabular-nums text-text-primary">{inr(summary.outstanding_inr)}</span>
        <span className="text-caption text-text-secondary">across {summary.cases} cases</span>
      </div>

      <div className="flex flex-1 basis-56 flex-col gap-xs rounded-md border border-border bg-surface px-md py-sm">
        <span className="text-caption text-text-secondary">Not yet due</span>
        <span className="text-h3 tabular-nums text-text-primary">{inr(summary.expected_share_inr)}</span>
        <span className="text-caption text-text-secondary">Open cases, and college money not received yet</span>
      </div>

      <button
        type="button"
        onClick={onAwaitingClick}
        className="flex flex-1 basis-56 flex-col gap-xs rounded-md border border-border bg-surface px-md py-sm text-left transition-colors hover:border-text-secondary"
      >
        <span className="text-caption text-text-secondary">Awaiting confirmation</span>
        <span className="text-h3 tabular-nums text-text-primary">{summary.awaiting.count}</span>
        <span className="text-caption text-text-secondary">{inr(summary.awaiting.amount_inr)}</span>
      </button>

      <button
        type="button"
        onClick={onOverdueClick}
        className={`flex flex-1 basis-56 flex-col gap-xs rounded-md border px-md py-sm text-left transition-colors ${
          overdue > 0 ? 'border-warning bg-warning/10 hover:opacity-90' : 'border-border bg-surface hover:border-text-secondary'
        }`}
      >
        <span className="text-caption text-text-secondary">Overdue</span>
        <span className={`text-h3 tabular-nums ${overdue > 0 ? 'text-warning' : 'text-text-primary'}`}>{inr(overdue)}</span>
        <span className="text-caption text-text-secondary">unpaid, past its due date</span>
      </button>

      <div className="flex flex-1 basis-56 flex-col gap-xs rounded-md border border-border bg-surface px-md py-sm">
        <span className="text-caption text-text-secondary">Received this month</span>
        <span className="text-h3 tabular-nums text-text-primary">{inr(summary.received_this_month_inr)}</span>
      </div>

      <div className="flex flex-1 basis-56 flex-col gap-xs rounded-md border border-border bg-surface px-md py-sm">
        {/* Relabelled (2026-09-12, product review H4) — the old "Collected by consultancies" read
            as immiNow's own money. This is what consultancies have LOGGED as received from
            students and colleges; immiNow's own receipts are the separate "Received this month"
            tile above. */}
        <span className="text-caption text-text-secondary">Recorded by consultancies</span>
        <span className="text-body-sm tabular-nums text-text-primary">
          {inr(summary.collected_inr)} of {inr(summary.expected_inr)}
        </span>
        <div className="h-1 w-full overflow-hidden rounded-full bg-border">
          <div className="h-1 rounded-full bg-primary" style={{ width: `${collectedPercent}%` }} />
        </div>
        <span className="text-caption text-text-secondary">
          Instalments consultancies have logged as received from students and colleges. immiNow&rsquo;s own receipts
          are in Received this month.
        </span>
      </div>

      {/* Flagged cases (2026-09-12, product review H5) — cases sitting in the payment
          follow-ups queue with real money pending. Hidden at zero, like the old
          "Payment follow-ups" card this replaces, so a clean books month shows nothing here. */}
      {(summary.payment_followups_pending_inr ?? 0) > 0 && (
        <Link
          to="/admin/case-followups"
          className="flex flex-1 basis-56 flex-col gap-xs rounded-md border border-warning bg-warning/10 px-md py-sm text-left transition-colors hover:opacity-90"
        >
          <span className="text-caption text-text-secondary">Flagged cases</span>
          <span className="text-h3 tabular-nums text-warning">{inr(summary.payment_followups_pending_inr)}</span>
          <span className="text-caption text-text-secondary">
            pending across {summary.payment_followups} case{summary.payment_followups === 1 ? '' : 's'}
          </span>
        </Link>
      )}
    </div>
  )
}

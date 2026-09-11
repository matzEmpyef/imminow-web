import { Skeleton } from '@/components/QueryState'

export interface DisputeSummary {
  open?: number
  open_over_3_days?: number
  resolved_this_month?: number
}

/** Disputes' three glance tiles (2026-09-11) — same small-card pattern as FinanceSummaryTiles. */
export function DisputeSummaryTiles({ summary, loading }: { summary?: DisputeSummary; loading?: boolean }) {
  if (loading || !summary) {
    return (
      <div className="flex flex-wrap gap-sm">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 flex-1 basis-56 rounded-md" />
        ))}
      </div>
    )
  }

  const overThree = summary.open_over_3_days ?? 0

  return (
    <div className="flex flex-wrap gap-sm">
      <div className="flex flex-1 basis-56 flex-col gap-xs rounded-md border border-border bg-surface px-md py-sm">
        <span className="text-caption text-text-secondary">Open</span>
        <span className="text-h3 tabular-nums text-text-primary">{summary.open ?? 0}</span>
      </div>
      <div
        className={`flex flex-1 basis-56 flex-col gap-xs rounded-md border px-md py-sm ${
          overThree > 0 ? 'border-warning bg-warning/5' : 'border-border bg-surface'
        }`}
      >
        <span className="text-caption text-text-secondary">Paused 3+ days</span>
        <span className={`text-h3 tabular-nums ${overThree > 0 ? 'text-warning' : 'text-text-primary'}`}>
          {overThree}
        </span>
      </div>
      <div className="flex flex-1 basis-56 flex-col gap-xs rounded-md border border-border bg-surface px-md py-sm">
        <span className="text-caption text-text-secondary">Resolved this month</span>
        <span className="text-h3 tabular-nums text-text-primary">{summary.resolved_this_month ?? 0}</span>
      </div>
    </div>
  )
}

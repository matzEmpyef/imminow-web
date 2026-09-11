import type { ReactNode } from 'react'
import { Skeleton } from '@/components/QueryState'
import type { FollowupSummary } from '@/queries/caseFollowups'

interface TileProps {
  label: string
  value: ReactNode
  active?: boolean
  onClick?: () => void
}

// Small, not a Card — this sits ABOVE the table as a glance strip, not a dashboard of its own
// (user's UI direction: polished but not oversized). Clickable tiles double as the matching quick
// filter's toggle, so a number and its filter are always the same control.
function Tile({ label, value, active, onClick }: TileProps) {
  const shared = 'flex flex-1 basis-32 flex-col gap-xs rounded-md border px-md py-sm text-left transition-colors'
  const tone = active ? 'border-primary bg-primary/10' : 'border-border bg-surface'
  if (!onClick) {
    return (
      <div className={`${shared} ${tone}`}>
        <span className="text-caption text-text-secondary">{label}</span>
        <span className="text-h3 tabular-nums text-text-primary">{value}</span>
      </div>
    )
  }
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`${shared} ${tone} cursor-pointer hover:border-text-secondary`}
    >
      <span className="text-caption text-text-secondary">{label}</span>
      <span className={`text-h3 tabular-nums ${active ? 'text-primary' : 'text-text-primary'}`}>{value}</span>
    </button>
  )
}

interface FollowupSummaryStripProps {
  summary?: FollowupSummary
  loading?: boolean
  /** "Cases" for Payment follow-ups, "Students" for Student follow-ups. */
  totalLabel: string
  /** Payment follow-ups only — pass `summary?.pending_inr` to show the "₹X pending" tile. */
  showPendingInr?: boolean
  notCalledActive: boolean
  onToggleNotCalled: () => void
  dueActive: boolean
  onToggleDue: () => void
}

/**
 * The one-row stat strip both follow-up queues open with (2026-09-11): what's pending (payment
 * only), how many rows total, how many nobody has called, how many are due for a call today, and
 * how many are snoozed. "Not called" and "Due" double as the quick filters below the table.
 */
export function FollowupSummaryStrip({
  summary,
  loading,
  totalLabel,
  showPendingInr,
  notCalledActive,
  onToggleNotCalled,
  dueActive,
  onToggleDue,
}: FollowupSummaryStripProps) {
  if (loading || !summary) {
    const count = showPendingInr ? 5 : 4
    return (
      <div className="flex flex-wrap gap-sm">
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className="h-16 flex-1 basis-32 rounded-md" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-sm">
      {showPendingInr && <Tile label="Pending" value={`₹${(summary.pending_inr ?? 0).toLocaleString('en-IN')}`} />}
      <Tile label={totalLabel} value={summary.total} />
      <Tile label="Not called yet" value={summary.not_called} active={notCalledActive} onClick={onToggleNotCalled} />
      <Tile label="Due for a call" value={summary.due_for_call} active={dueActive} onClick={onToggleDue} />
      <Tile label="Snoozed" value={summary.snoozed} />
    </div>
  )
}

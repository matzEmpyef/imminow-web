import { Skeleton } from '@/components/QueryState'
import type { FinanceSummary } from '@/queries/financeDashboard'

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthLabel(month: string): string {
  const parts = /^(\d{4})-(\d{2})$/.exec(month)
  if (!parts) return month
  const idx = Number(parts[2]) - 1
  return MONTH_ABBR[idx] ?? month
}

const CHART_HEIGHT = 120

/**
 * "Confirmed payments, last 12 months" (2026-09-11) — plain divs, no chart library, matching the
 * build's existing hand-rolled progress bars (e.g. ServiceFollowupsPage's ProfileBar). A zero month
 * still draws its baseline sliver so the axis reads as 12 continuous months rather than gaps.
 */
export function FinanceRevenueChart({ months, loading }: { months?: FinanceSummary['revenue_by_month']; loading?: boolean }) {
  if (loading || !months) {
    return <Skeleton className="h-40 rounded-lg" />
  }

  const max = Math.max(1, ...months.map((m) => m.amount_inr))

  return (
    <div className="rounded-lg bg-surface p-lg shadow-card">
      <h2 className="text-h3 text-text-primary">Confirmed payments, last 12 months</h2>
      <div className="mt-md flex items-end gap-xs" style={{ height: CHART_HEIGHT }}>
        {months.map((m) => {
          const isMax = m.amount_inr === max && max > 0
          const barHeight = m.amount_inr > 0 ? Math.max(4, Math.round((m.amount_inr / max) * CHART_HEIGHT)) : 2
          return (
            <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-xs" style={{ height: CHART_HEIGHT }}>
              {isMax && <span className="text-caption font-medium text-text-primary">₹{m.amount_inr.toLocaleString('en-IN')}</span>}
              <div
                title={`${monthLabel(m.month)}: ₹${m.amount_inr.toLocaleString('en-IN')}`}
                className={`w-full rounded-t-sm ${m.amount_inr > 0 ? 'bg-primary' : 'bg-border'}`}
                style={{ height: barHeight }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-xs flex gap-xs">
        {months.map((m) => (
          <span key={m.month} className="flex-1 text-center text-caption text-text-secondary">
            {monthLabel(m.month)}
          </span>
        ))}
      </div>
    </div>
  )
}

import { DATE_MIN, DATE_MAX } from '@/lib/validation'
import { DateRangeProblem } from '@/components/DateRangeProblem'
/**
 * The date range of both audit logs (review F-114). The log is kept for good, so the server reads
 * a window: the dates chosen here (`filter[from]` / `filter[to]`), or the last 30 days when no
 * From date is chosen. A To date on its own still reads inside those 30 days, which is why the
 * note below is tied to the From date alone.
 */
export function AuditDateRange({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
}) {
  return (
    <>
      <input
        type="date"
        value={from}
        min={DATE_MIN}
        max={to || DATE_MAX}
        onChange={(e) => onFromChange(e.target.value)}
        aria-label="From"
        className="h-10 rounded-md border border-border bg-background px-3 text-body-sm"
      />
      <input
        type="date"
        value={to}
        min={from || DATE_MIN}
        max={DATE_MAX}
        onChange={(e) => onToChange(e.target.value)}
        aria-label="To"
        className="h-10 rounded-md border border-border bg-background px-3 text-body-sm"
      />
      <DateRangeProblem from={from} to={to} />
    </>
  )
}

/** Said under the page title while no From date is chosen; nothing once one is. */
export function AuditWindowNote({ from }: { from: string }) {
  if (from) return null
  return (
    <p className="mt-xs text-caption text-text-secondary">
      Showing the last 30 days. Choose a From date to look further back.
    </p>
  )
}

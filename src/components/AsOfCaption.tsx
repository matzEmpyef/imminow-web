import { AlertTriangle } from 'lucide-react'
import { formatAsOf, isAsOfStale } from '@/lib/time'

/**
 * How fresh a rollup-backed dashboard is (contract gate 12, owner Q7): "Figures as of 14:00".
 * Renders nothing when the response carries no `as_of` — the frozen mock computes live and sends
 * null — so no page ever shows a made-up time. `note` carries what stays live on that page.
 *
 * Two things it now says that it did not (review F-161). The DATE, whenever the figures are not
 * from today. And a WARNING, in place of "refreshed hourly", when they are more than two refreshes
 * old: a refresh that has been failing since yesterday used to look the same as a healthy one.
 * `dated` shows the date even today, for a page whose figures are known to run behind.
 */
export function AsOfCaption({
  asOf,
  note,
  dated = false,
  className = '',
}: {
  asOf: string | null | undefined
  /** What is NOT covered by the stamp, e.g. "Queues are live." */
  note?: string
  dated?: boolean
  className?: string
}) {
  const label = formatAsOf(asOf, { dated })
  if (!label) return null
  if (isAsOfStale(asOf)) {
    return (
      <p
        role="status"
        className={`flex items-start gap-xs text-caption text-warning ${className}`}
        title="Dashboard figures are normally refreshed hourly"
      >
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Figures {label}. These are older than expected: the hourly refresh may be delayed.{note ? ` ${note}` : ''}
        </span>
      </p>
    )
  }
  return (
    <p className={`text-caption text-text-secondary ${className}`} title="Dashboard figures are refreshed hourly">
      Figures {label}, refreshed hourly.{note ? ` ${note}` : ''}
    </p>
  )
}

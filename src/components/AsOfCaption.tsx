import { formatAsOf } from '@/lib/time'

/**
 * How fresh a rollup-backed dashboard is (contract gate 12, owner Q7): "Figures as of 14:00".
 * Renders nothing when the response carries no `as_of` — the frozen mock computes live and sends
 * null — so no page ever shows a made-up time. `note` carries what stays live on that page.
 */
export function AsOfCaption({
  asOf,
  note,
  className = '',
}: {
  asOf: string | null | undefined
  /** What is NOT covered by the stamp, e.g. "Queues are live." */
  note?: string
  className?: string
}) {
  const label = formatAsOf(asOf)
  if (!label) return null
  return (
    <p className={`text-caption text-text-secondary ${className}`} title="Dashboard figures are refreshed hourly">
      Figures {label}, refreshed hourly.{note ? ` ${note}` : ''}
    </p>
  )
}

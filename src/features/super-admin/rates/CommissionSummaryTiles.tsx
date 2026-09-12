import { Link } from 'react-router-dom'
import { Card } from '@/components/Card'

interface Summary {
  with_gaps: number
  countries_without_rates: number
  countries_partly_set: number
  default_rate_cases: number
}

function Tile({
  label,
  value,
  warn,
  onClick,
  active,
  to,
  hint,
}: {
  label: string
  value: number
  warn?: boolean
  onClick?: () => void
  active?: boolean
  to?: string
  hint?: string
}) {
  const valueClass = warn && value > 0 ? 'text-warning' : 'text-text-primary'
  const content = (
    <>
      <p className="text-caption text-text-secondary">{label}</p>
      <p className={`text-h2 ${valueClass}`}>{value}</p>
      {hint && <p className="text-caption text-text-secondary">{hint}</p>}
    </>
  )
  const clickable = Boolean(onClick || to)
  const className = `flex flex-col gap-xs ${clickable ? 'cursor-pointer' : ''} ${
    active ? 'ring-2 ring-primary' : ''
  }`

  if (to) {
    return (
      <Card className={className} onClick={undefined}>
        <Link to={to} className="flex flex-col gap-xs">
          {content}
        </Link>
      </Card>
    )
  }

  return (
    <Card className={className} onClick={onClick}>
      {content}
    </Card>
  )
}

/**
 * Four at-a-glance numbers the old page never showed at all (Commission Rates rebuild,
 * 2026-09-11) — coverage gaps, countries with no rate or only some payer types set, and how many
 * currently-active cases are being priced at the invisible fallback default right now.
 * "Accounts with gaps" toggles the table's coverage filter; "Cases priced at the default" jumps to
 * Finance → Cases pre-filtered to exactly those.
 *
 * The tile's own number (`summary.with_gaps`) only ever counted `coverage: partial|missing` —
 * accounts serving zero countries (`coverage: none_served`) were invisible in it, which read as
 * "only 7 accounts need attention" when a `none_served` account needs attention too, just not a
 * rate-editing kind (product review L12, 2026-09-12). Rather than folding a different kind of gap
 * into one number, the label now says exactly what it counts and a hint line names the rest —
 * `noCountriesCount` comes from a separate `filter[coverage]=none_served` query's `meta.total`
 * (see CommissionRatesPage), since the summary object itself has no such field to read.
 */
export function CommissionSummaryTiles({
  summary,
  gapsActive,
  onToggleGaps,
  noCountriesCount,
}: {
  summary: Summary | undefined
  gapsActive: boolean
  onToggleGaps: () => void
  noCountriesCount?: number
}) {
  return (
    <div className="grid grid-cols-2 gap-md sm:grid-cols-4">
      <Tile
        label="Accounts with partial or missing rates"
        value={summary?.with_gaps ?? 0}
        warn
        onClick={onToggleGaps}
        active={gapsActive}
        hint={
          noCountriesCount != null
            ? `${noCountriesCount} ${noCountriesCount === 1 ? 'account has' : 'accounts have'} no countries yet`
            : undefined
        }
      />
      <Tile label="Countries with no rate" value={summary?.countries_without_rates ?? 0} warn />
      <Tile label="Countries partly set" value={summary?.countries_partly_set ?? 0} warn />
      <Tile
        label="Cases priced at the default"
        value={summary?.default_rate_cases ?? 0}
        warn
        to="/admin/finance-dashboard?tab=cases&rate=default"
      />
    </div>
  )
}

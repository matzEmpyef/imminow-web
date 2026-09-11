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
}: {
  label: string
  value: number
  warn?: boolean
  onClick?: () => void
  active?: boolean
  to?: string
}) {
  const valueClass = warn && value > 0 ? 'text-warning' : 'text-text-primary'
  const content = (
    <>
      <p className="text-caption text-text-secondary">{label}</p>
      <p className={`text-h2 ${valueClass}`}>{value}</p>
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
 */
export function CommissionSummaryTiles({
  summary,
  gapsActive,
  onToggleGaps,
}: {
  summary: Summary | undefined
  gapsActive: boolean
  onToggleGaps: () => void
}) {
  return (
    <div className="grid grid-cols-2 gap-md sm:grid-cols-4">
      <Tile label="Accounts with gaps" value={summary?.with_gaps ?? 0} warn onClick={onToggleGaps} active={gapsActive} />
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

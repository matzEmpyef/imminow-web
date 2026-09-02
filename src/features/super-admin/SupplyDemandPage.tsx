import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Card } from '@/components/Card'
import { Table, type TableColumn } from '@/components/Table'
import { DoughnutChart } from '@/components/DoughnutChart'
import { MonthlyBarChart } from '@/components/MonthlyBarChart'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useSupplyDemand } from '@/queries/supplyDemand'
import { formatDate } from '@/lib/time'

type SupplyRow = NonNullable<ReturnType<typeof useSupplyDemand>['data']>['supply_by_country'][number]
type MismatchRow = NonNullable<ReturnType<typeof useSupplyDemand>['data']>['mismatch'][number]

// Weekly buckets (what the contract returns — docs/PROGRESS.md §4 Step 4) rolled up to monthly so
// this reuses MonthlyBarChart exactly as every other dashboard chart does, rather than introducing
// a second chart shape for one page. The underlying data stays weekly; only the chart's display
// grain changes.
function rollUpToMonthly(weekly: { week: string; count: number }[]) {
  const byMonth = new Map<string, number>()
  for (const { week, count } of weekly) {
    const month = week.slice(0, 7)
    byMonth.set(month, (byMonth.get(month) ?? 0) + count)
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value }))
}

function MismatchBadge({ row }: { row: MismatchRow }) {
  if (row.supply === 0) return <Badge color="error">No coverage</Badge>
  if (row.supply < row.demand) return <Badge color="warning">Limited coverage</Badge>
  return null
}

export function SupplyDemandPage() {
  const supplyDemand = useSupplyDemand()

  if (supplyDemand.isLoading) {
    return (
      <AdminShell>
        <Skeleton className="h-64 rounded-lg" />
      </AdminShell>
    )
  }

  if (supplyDemand.isError || !supplyDemand.data) {
    return (
      <AdminShell>
        <ErrorState message="Could not load supply/demand data." onRetry={() => supplyDemand.refetch()} />
      </AdminShell>
    )
  }

  const data = supplyDemand.data

  const supplyColumns: TableColumn<SupplyRow>[] = [
    { key: 'country', header: 'Country', render: (r) => r.country },
    { key: 'consultancy_count', header: 'Consultancies serving', align: 'right', render: (r) => r.consultancy_count },
    {
      key: 'seat_usage',
      header: 'Seat usage',
      align: 'right',
      render: (r) => `${r.seat_usage.used} / ${r.seat_usage.limit}`,
    },
  ]

  const mismatchColumns: TableColumn<MismatchRow>[] = [
    { key: 'country', header: 'Country', render: (r) => r.country },
    { key: 'demand', header: 'Students wanting it', align: 'right', render: (r) => r.demand },
    { key: 'supply', header: 'Consultancies serving it', align: 'right', render: (r) => r.supply },
    { key: 'flag', header: '', render: (r) => <MismatchBadge row={r} /> },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Supply & Demand</h1>
          <p className="text-body-sm text-text-secondary">
            Where students want to go vs. where consultancies actually serve — collecting since{' '}
            {formatDate(data.collecting_since)}.
          </p>
        </div>

        {/* Abroad vs home at a glance (user, 2026-09-02: "how many students are looking for
            study abroad or india"). Distinct students — the four add up to every account — where
            the per-country chart below counts a student once per target country. "Home" is each
            student's own resident country. */}
        <div className="grid grid-cols-2 gap-md md:grid-cols-4">
          {(
            [
              ['Study Abroad only', data.destination_split.abroad_only, 'Every target country is outside where they live.'],
              ['Study at Home only', data.destination_split.home_only, 'Only their own country of residence.'],
              ['Both', data.destination_split.both, 'Targeting home and at least one country abroad.'],
              ['No preference yet', data.destination_split.no_preference, 'Not through onboarding — nothing declared.'],
            ] as const
          ).map(([label, value, hint]) => (
            <Card key={label}>
              <p className="text-caption text-text-secondary">{label}</p>
              <p className="mt-xs text-h1 text-text-primary">{value}</p>
              <p className="mt-xs text-caption text-text-secondary">{hint}</p>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
          <Card>
            <h2 className="text-h3 text-text-primary">Demand by Target Country</h2>
            <p className="text-caption text-text-secondary">
              Students who have set a study preference — one count per student per target country, with each
              country&apos;s share of those students.
            </p>
            <div className="mt-sm">
              <DoughnutChart data={data.demand_by_country.map((d) => ({ label: d.country, value: d.student_count }))} />
            </div>
            <ul className="mt-sm flex flex-col gap-xs">
              {data.demand_by_country.map((d) => (
                <li key={d.country} className="flex items-center justify-between text-body-sm">
                  <span className="text-text-primary">{d.country}</span>
                  <span className="text-text-secondary">
                    {d.student_count} · {d.share_pct}%
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="text-h3 text-text-primary">Demand by Field of Interest</h2>
            <div className="mt-sm">
              <DoughnutChart data={data.demand_by_field.map((d) => ({ label: d.field, value: d.student_count }))} />
            </div>
          </Card>
        </div>

        <Card>
          <h2 className="text-h3 text-text-primary">Signups Over Time</h2>
          <p className="text-caption text-text-secondary">Weekly buckets, rolled up to months for this chart.</p>
          <div className="mt-sm">
            <MonthlyBarChart
              data={rollUpToMonthly(data.signups_over_time)}
              valueLabel="Student signups"
              color="var(--color-primary)"
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-h3 text-text-primary">Supply by Country</h2>
          <p className="text-caption text-text-secondary">
            Every country at least one consultancy serves, with combined seat usage.
          </p>
          <div className="mt-sm">
            <Table bare columns={supplyColumns} rows={data.supply_by_country} rowKey={(r) => r.country} />
          </div>
        </Card>

        <Card>
          <h2 className="text-h3 text-text-primary">Demand/Supply Mismatch</h2>
          <p className="text-caption text-text-secondary">
            Every country with real student demand, sorted by the least-served first — the actionable list.
          </p>
          <div className="mt-sm">
            <Table
              bare
              columns={mismatchColumns}
              rows={data.mismatch}
              rowKey={(r) => r.country}
              emptyMessage="No student demand recorded yet."
            />
          </div>
        </Card>
      </div>
    </AdminShell>
  )
}

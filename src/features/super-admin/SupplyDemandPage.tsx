import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Card } from '@/components/Card'
import { Table, type TableColumn } from '@/components/Table'
import { MonthlyBarChart } from '@/components/MonthlyBarChart'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useSupplyDemand } from '@/queries/supplyDemand'
import { formatDate } from '@/lib/time'

type SupplyRow = NonNullable<ReturnType<typeof useSupplyDemand>['data']>['supply_by_country'][number]
type MismatchRow = NonNullable<ReturnType<typeof useSupplyDemand>['data']>['mismatch'][number]
type DestinationRow = NonNullable<ReturnType<typeof useSupplyDemand>['data']>['applicant_destinations'][number]

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

// Ranked demand (user review, 2026-09-10) — bars rather than a doughnut: students can choose
// several, so the shares are of students and can add up to more than 100%. The top 10 come from
// the server with one Others row for the rest (distinct students, not picks).
interface DemandRow {
  key: string
  label: string
  count: number
  pct: number
  tag?: string | null
  muted?: boolean
}

function DemandBars({
  rows,
  others,
  optionNoun,
}: {
  rows: DemandRow[]
  others: { options: number; student_count: number; share_pct: number }
  optionNoun: string
}) {
  if (rows.length === 0) return <p className="mt-sm text-body-sm text-text-secondary">No choices recorded yet.</p>
  const all: DemandRow[] =
    others.options > 0
      ? [
          ...rows,
          {
            key: '__others',
            label: `Others (${others.options} ${optionNoun})`,
            count: others.student_count,
            pct: others.share_pct,
            muted: true,
          },
        ]
      : rows
  const widest = Math.max(1, ...all.map((r) => r.count))
  return (
    <ol className="mt-md flex flex-col gap-sm">
      {all.map((r) => (
        <li key={r.key} className="flex flex-col gap-xs">
          <div className="flex items-baseline justify-between gap-sm">
            <span className={`flex items-center gap-xs text-body-sm ${r.muted ? 'text-text-secondary' : 'text-text-primary'}`}>
              {r.label}
              {r.tag && <Badge color="secondary">{r.tag}</Badge>}
            </span>
            <span className="text-body-sm tabular-nums text-text-primary">
              <span className="font-medium">{r.count}</span>
              <span className="ml-xs text-caption text-text-secondary">{r.pct}%</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-background">
            <div
              className={`h-2 rounded-full ${r.muted ? 'bg-text-secondary/40' : 'bg-primary'}`}
              style={{ width: `${(r.count / widest) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}

// "62%" of all student accounts — the six buckets share one denominator, so the shares add up.
function sharePct(value: number, total: number) {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : ''
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

  const destinationColumns: TableColumn<DestinationRow>[] = [
    { key: 'country', header: 'Country', render: (r) => r.country },
    { key: 'applicants', header: 'Applicants now', align: 'right', render: (r) => r.applicants },
    { key: 'enrolled', header: 'Enrolled', align: 'right', render: (r) => r.enrolled },
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

        {/* Where students want to study (user, 2026-09-02; revised 2026-09-10). Distinct students
            — the six add up to every account — where the per-country chart below counts a student
            once per target country. "Home" is each student's own resident country. Not onboarded
            is the same rule and number as Needs attention's "Students stuck at onboarding". */}
        <section className="flex flex-col gap-sm">
          <h2 className="text-h3 text-text-primary">Where students want to study</h2>
          <div className="grid grid-cols-2 gap-md md:grid-cols-3">
            {(
              [
                ['Study Abroad only', data.destination_split.abroad_only, 'Every target country is outside where they live.'],
                ['Study at Home only', data.destination_split.home_only, 'Only their own country of residence.'],
                ['Both', data.destination_split.both, 'Targeting home and at least one country abroad.'],
                [
                  'Residence not set',
                  data.destination_split.residence_not_set,
                  'Chose target countries but not where they live, so home vs abroad is unknown.',
                ],
                [
                  'No target country',
                  data.destination_split.no_target_country,
                  'Onboarded (for example, has a case) but never chose a destination.',
                ],
                [
                  'Not onboarded',
                  data.destination_split.not_onboarded,
                  'Signed up but never set a study level or target country — as on Needs attention.',
                ],
              ] as const
            ).map(([label, value, hint]) => (
              <Card key={label}>
                <p className="text-caption text-text-secondary">{label}</p>
                <p className="mt-xs text-h1 text-text-primary">
                  {value}
                  <span className="ml-xs text-body-sm text-text-secondary">{sharePct(value, data.destination_split.total_students)}</span>
                </p>
                <p className="mt-xs text-caption text-text-secondary">{hint}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Supply at a glance (user, 2026-09-10) — the row above is demand only. */}
        <section className="flex flex-col gap-sm">
          <h2 className="text-h3 text-text-primary">Coverage</h2>
          <div className="grid grid-cols-1 gap-md md:grid-cols-2">
            <Card>
              <p className="text-caption text-text-secondary">Countries With No Coverage</p>
              <p className={`mt-xs text-h1 ${data.supply_summary.countries_without_coverage > 0 ? 'text-error' : 'text-text-primary'}`}>
                {data.supply_summary.countries_without_coverage}
              </p>
              <p className="mt-xs text-caption text-text-secondary">
                Students want to study there, but no consultancy or institute serves it. See the mismatch list below.
              </p>
            </Card>
            <Card>
              <p className="text-caption text-text-secondary">Seat Usage</p>
              <p className="mt-xs text-h1 text-text-primary">
                {data.supply_summary.seat_usage.pct == null ? '—' : `${data.supply_summary.seat_usage.pct}%`}
              </p>
              <p className="mt-xs text-caption text-text-secondary">
                {data.supply_summary.seat_usage.used} of {data.supply_summary.seat_usage.limit} seats in use across active
                consultancies and institutes.
              </p>
            </Card>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
          <Card>
            <h2 className="text-h3 text-text-primary">Demand by Target Country</h2>
            <p className="text-caption text-text-secondary">
              {data.students_with_country_choice} students have chosen at least one country. Students can choose several,
              so the shares add up to more than 100%. &quot;Home&quot; marks students choosing the country they live in.
            </p>
            <DemandBars
              rows={data.demand_by_country.map((d) => ({
                key: d.country,
                label: d.country,
                count: d.student_count,
                pct: d.share_pct,
                tag: d.home_count > 0 ? `Home for ${d.home_count}` : null,
              }))}
              others={data.demand_by_country_others}
              optionNoun="countries"
            />
          </Card>
          <Card>
            <h2 className="text-h3 text-text-primary">Demand by Field of Interest</h2>
            <p className="text-caption text-text-secondary">
              {data.students_with_field_choice} students have chosen at least one field. Students can choose several, so
              the shares add up to more than 100%.
            </p>
            <DemandBars
              rows={data.demand_by_field.map((d) => ({
                key: d.field,
                label: d.field,
                count: d.student_count,
                pct: d.share_pct,
              }))}
              others={data.demand_by_field_others}
              optionNoun="fields"
            />
          </Card>
        </div>

        {/* Where applicants are actually heading (user, 2026-09-10) — decided destinations, beside
            the preferences above. */}
        <Card>
          <h2 className="text-h3 text-text-primary">Where Applicants Are Heading</h2>
          <p className="text-caption text-text-secondary">
            The country each case settled on once a college was accepted — current applicants and everyone enrolled.
            Cases without an accepted college yet show as &quot;Not decided yet&quot;.
          </p>
          <div className="mt-sm">
            <Table
              bare
              columns={destinationColumns}
              rows={data.applicant_destinations}
              rowKey={(r) => r.country}
              emptyMessage="No applicants yet."
            />
          </div>
        </Card>

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
            <Table
              bare
              columns={supplyColumns}
              rows={data.supply_by_country}
              rowKey={(r) => r.country}
              emptyMessage="No consultancy has listed a country it serves yet."
            />
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

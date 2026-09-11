import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Card } from '@/components/Card'
import { DoughnutChart, type DoughnutChartDatum } from '@/components/DoughnutChart'
import { Table, type TableColumn } from '@/components/Table'
import { MonthlyBarChart } from '@/components/MonthlyBarChart'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useSupplyDemand } from '@/queries/supplyDemand'
import { formatDate } from '@/lib/time'

type SupplyRow = NonNullable<ReturnType<typeof useSupplyDemand>['data']>['supply_by_country'][number]
type MismatchRow = NonNullable<ReturnType<typeof useSupplyDemand>['data']>['mismatch'][number]
// One row of the Where Applicants Are Heading table — a real country, or the Others roll-up.
interface DestinationTableRow {
  key: string
  country: string
  applying: number
  accepted: number
  enrolled: number
  pct: number
  muted?: boolean
}

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

// Doughnut of the top 9 + one Others slice (user, 2026-09-11 — doughnuts back, but honest).
// Slices are sized by CHOICES: a student can choose several, so the legend's % is a share of all
// choices, while the count beside it is students. One percentage per card, never two.
function demandSlices(
  rows: { label: string; count: number; tag?: string | null }[],
  others: { options: number; choice_count: number },
  optionNoun: string,
): DoughnutChartDatum[] {
  const all = [
    ...rows.map((r) => ({ label: r.label, value: r.count, isOthers: false, tag: r.tag ?? null })),
    ...(others.options > 0
      ? [{ label: `Others (${others.options} ${optionNoun})`, value: others.choice_count, isOthers: true, tag: null }]
      : []),
  ]
  const total = all.reduce((sum, s) => sum + s.value, 0)
  return all.map((s) => {
    const share = total ? Math.round((s.value / total) * 100) : 0
    const unit = s.isOthers ? 'choices' : s.value === 1 ? 'student' : 'students'
    return {
      label: s.label,
      value: s.value,
      detail: `${s.value} ${unit} · ${share}% of choices${s.tag ? ` · ${s.tag}` : ''}`,
    }
  })
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

  const destinations = data.applicant_destinations
  const destinationRows: DestinationTableRow[] = [
    ...destinations.rows.map((r) => ({
      key: r.country,
      country: r.country,
      applying: r.applying,
      accepted: r.accepted,
      enrolled: r.enrolled,
      pct: r.pct_of_applicants,
    })),
    ...(destinations.others.countries > 0
      ? [
          {
            key: '__others',
            country: `Others (${destinations.others.countries} countries)`,
            applying: destinations.others.applying,
            accepted: destinations.others.accepted,
            enrolled: destinations.others.enrolled,
            pct: destinations.others.pct_of_applicants,
            muted: true,
          },
        ]
      : []),
  ]
  const muted = (r: DestinationTableRow, text: string | number) =>
    r.muted ? <span className="text-text-secondary">{text}</span> : text
  const destinationColumns: TableColumn<DestinationTableRow>[] = [
    { key: 'country', header: 'Country', render: (r) => muted(r, r.country) },
    { key: 'applying', header: 'Applying', align: 'right', render: (r) => muted(r, r.applying) },
    { key: 'accepted', header: 'Accepted', align: 'right', render: (r) => muted(r, r.accepted) },
    { key: 'enrolled', header: 'Enrolled', align: 'right', render: (r) => muted(r, r.enrolled) },
    { key: 'pct', header: 'Share of applicants', align: 'right', render: (r) => muted(r, `${r.pct}%`) },
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
              {data.students_with_country_choice} students have chosen at least one country. They can choose several, so
              each share is of all choices. &quot;home for N&quot; marks students choosing the country they live in.
            </p>
            <div className="mt-sm">
              <DoughnutChart
                data={demandSlices(
                  data.demand_by_country.map((d) => ({
                    label: d.country,
                    count: d.student_count,
                    tag: d.home_count > 0 ? `home for ${d.home_count}` : null,
                  })),
                  data.demand_by_country_others,
                  'countries',
                )}
              />
            </div>
          </Card>
          <Card>
            <h2 className="text-h3 text-text-primary">Demand by Field of Interest</h2>
            <p className="text-caption text-text-secondary">
              {data.students_with_field_choice} students have chosen at least one field. They can choose several, so each
              share is of all choices.
            </p>
            <div className="mt-sm">
              <DoughnutChart
                data={demandSlices(
                  data.demand_by_field.map((d) => ({ label: d.field, count: d.student_count })),
                  data.demand_by_field_others,
                  'fields',
                )}
              />
            </div>
          </Card>
        </div>

        {/* Where applicants are heading (user review, 2026-09-11) — from each case's applications,
            not only the accepted college, beside the preferences above. */}
        <Card>
          <h2 className="text-h3 text-text-primary">Where Applicants Are Heading</h2>
          <p className="text-caption text-text-secondary">
            Each of the {destinations.current_applicants} open student cases counts once: Accepted where a college has
            accepted them, otherwise Applying in every country they have an application under way — a student applying in
            two countries appears in both. Enrolled is all time. Share = open cases heading there.
          </p>
          <div className="mt-sm">
            <Table
              bare
              columns={destinationColumns}
              rows={destinationRows}
              rowKey={(r) => r.key}
              emptyMessage="No applications recorded yet."
            />
          </div>
          <p className="mt-sm text-caption text-text-secondary">
            {destinations.no_application_yet} open {destinations.no_application_yet === 1 ? 'case has' : 'cases have'} no
            application yet · PR cases (no college involved): {destinations.pr_cases.in_progress} in progress,{' '}
            {destinations.pr_cases.enrolled} enrolled.
          </p>
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

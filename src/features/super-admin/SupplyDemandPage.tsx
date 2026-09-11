import { useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { useAuthStore } from '@/stores/authStore'
import { useUpdatePlatformSettings } from '@/queries/catalogSettings'
import { Badge } from '@/components/Badge'
import { Card } from '@/components/Card'
import { DoughnutChart, type DoughnutChartDatum } from '@/components/DoughnutChart'
import { Table, type TableColumn } from '@/components/Table'
import { MonthlyBarChart } from '@/components/MonthlyBarChart'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useSupplyDemand } from '@/queries/supplyDemand'
import { formatDate } from '@/lib/time'

type CoverageRow = NonNullable<ReturnType<typeof useSupplyDemand>['data']>['coverage_by_country']['rows'][number]
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

// Series colours for New Students by Destination: the chart hues for up to five countries, slate for
// Other and a quiet grey for No country yet, so the named destinations carry the colour.
const NEW_BY_DESTINATION_COLORS: Record<string, string> = {
  c0: 'var(--color-chart-1)',
  c1: 'var(--color-chart-2)',
  c2: 'var(--color-chart-3)',
  c3: 'var(--color-chart-4)',
  c4: 'var(--color-chart-5)',
  other: 'var(--color-chart-10)',
  no_country: 'var(--color-border)',
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
    // Short legend (user, 2026-09-11): "6 students (32%)". Others is sized by choices, so it says so.
    const unit = s.isOthers ? 'choices' : s.value === 1 ? 'student' : 'students'
    return {
      label: s.tag ? `${s.label} (${s.tag})` : s.label,
      value: s.value,
      detail: `${s.value} ${unit} (${share}%)`,
    }
  })
}

// "62%" of all student accounts — the six buckets share one denominator, so the shares add up.
function sharePct(value: number, total: number) {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : ''
}

// The capacity assumption behind the table (user, 2026-09-11: "20 default and editable"). Shown to
// everyone; editable by Super Admin or `catalog_settings`, the permission the setting's endpoint
// checks — everyone else sees the number without the Edit link.
function CapacityAssumption({ casesPerStaff, onSaved }: { casesPerStaff: number; onSaved: () => void }) {
  const canEdit = useAuthStore(
    (s) =>
      s.user?.role === 'super_admin' ||
      Boolean((s.user?.platform_permissions as Record<string, boolean> | undefined)?.catalog_settings),
  )
  const update = useUpdatePlatformSettings()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(casesPerStaff))
  const parsed = Number(value)
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 500

  if (!editing) {
    return (
      <p className="mt-sm text-caption text-text-secondary">
        Capacity assumes {casesPerStaff} open cases per active staff member.{' '}
        {canEdit && (
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => {
              setValue(String(casesPerStaff))
              setEditing(true)
            }}
          >
            Edit
          </button>
        )}
      </p>
    )
  }
  return (
    <form
      className="mt-sm flex flex-wrap items-center gap-sm text-body-sm"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        update.mutate(
          { cases_per_staff: parsed },
          {
            onSuccess: () => {
              setEditing(false)
              onSaved()
            },
          },
        )
      }}
    >
      <label htmlFor="cases-per-staff" className="text-text-secondary">
        Open cases per staff member
      </label>
      <input
        id="cases-per-staff"
        type="number"
        min={1}
        max={500}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-10 w-24 rounded-md border border-border bg-background px-3 text-body-sm"
      />
      <button
        type="submit"
        disabled={!valid || update.isPending}
        className="rounded-md bg-primary px-md py-xs text-text-on-primary disabled:opacity-50"
      >
        Save
      </button>
      <button type="button" className="text-text-secondary hover:underline" onClick={() => setEditing(false)}>
        Cancel
      </button>
      {!valid && <span className="text-caption text-error">A whole number from 1 to 500.</span>}
      {update.isError && <span className="text-caption text-error">Could not save — try again.</span>}
    </form>
  )
}

// Same two flags the old Mismatch table used, now from the server's `coverage` field.
function CoverageBadge({ row }: { row: CoverageRow }) {
  if (row.coverage === 'none') return <Badge color="error">No coverage</Badge>
  if (row.coverage === 'limited') return <Badge color="warning">Limited</Badge>
  return <Badge color="success">Covered</Badge>
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

  const coverageColumns: TableColumn<CoverageRow>[] = [
    { key: 'country', header: 'Country', render: (r) => r.country },
    { key: 'students_wanting', header: 'Students wanting it', align: 'right', render: (r) => r.students_wanting },
    { key: 'consultancies_serving', header: 'Consultancies', align: 'right', render: (r) => r.consultancies_serving },
    { key: 'institutes_serving', header: 'Institutes', align: 'right', render: (r) => r.institutes_serving },
    { key: 'open_applicants', header: 'Open applicants', align: 'right', render: (r) => r.open_applicants },
    { key: 'capacity', header: 'Capacity', align: 'right', render: (r) => r.capacity },
    { key: 'coverage', header: 'Coverage', render: (r) => <CoverageBadge row={r} /> },
  ]
  const coverageOthers = data.coverage_by_country.others

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
                Students want to study there, but no consultancy or institute that can take new students serves it. See
                Coverage by Country below.
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
              each % is a share of all choices. &quot;(home for N)&quot; = N of them live in that country.
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
              {data.students_with_field_choice} students have chosen at least one field. They can choose several, so each %
              is a share of all choices.
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

        {/* Replaced Signups Over Time (user, 2026-09-11) — new people per month is the Overview's
            New Registrations by Month; this is where those new students want to go. */}
        <Card>
          <h2 className="text-h3 text-text-primary">New Students by Destination</h2>
          <p className="text-caption text-text-secondary">
            Students who signed up each month, by their first-choice country. Placed by sign-up month — when a student
            chose their countries is not recorded.
          </p>
          <div className="mt-sm">
            <MonthlyBarChart
              data={data.new_students_by_destination.months.map((m) => ({ month: m.month, ...m.values }))}
              series={data.new_students_by_destination.series.map((s) => ({
                key: s.key,
                label: s.label,
                color: NEW_BY_DESTINATION_COLORS[s.key] ?? 'var(--color-chart-10)',
              }))}
            />
          </div>
        </Card>

        {/* Coverage by Country (user review, 2026-09-11) — merged Supply by Country and the
            Demand/Supply Mismatch table. Seat usage per country was dropped: it added each
            consultancy's whole team to every country it listed. */}
        <Card>
          <h2 className="text-h3 text-text-primary">Coverage by Country</h2>
          <p className="text-caption text-text-secondary">
            Demand beside supply, least-covered first. Only consultancies and institutes that can take new students count
            (active, subscription not lapsed). Capacity = spare room for new students: each organisation&apos;s active staff ×
            open cases per staff member, minus the cases it already has, split across the countries it serves. Limited =
            more students want it than that capacity.
          </p>
          <div className="mt-sm">
            <Table
              bare
              columns={coverageColumns}
              rows={data.coverage_by_country.rows}
              rowKey={(r) => r.country}
              emptyMessage="No demand or coverage recorded yet."
            />
          </div>
          <CapacityAssumption
            casesPerStaff={data.coverage_by_country.cases_per_staff}
            onSaved={() => void supplyDemand.refetch()}
          />
          {coverageOthers.countries > 0 && (
            <p className="mt-sm text-caption text-text-secondary">
              {coverageOthers.countries} more {coverageOthers.countries === 1 ? 'country' : 'countries'} ·{' '}
              {coverageOthers.no_coverage} with no coverage · {coverageOthers.limited} limited.
            </p>
          )}
        </Card>
      </div>
    </AdminShell>
  )
}

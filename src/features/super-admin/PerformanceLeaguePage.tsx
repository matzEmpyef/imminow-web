import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { CompactSelect } from '@/components/CompactSelect'
import { Table, type TableColumn } from '@/components/Table'
import {
  usePerformanceLeague,
  type PerformanceLeagueKind,
  type PerformanceLeagueWindow,
} from '@/queries/performanceLeague'
import { formatMoney } from '@/lib/money'

type Row = NonNullable<ReturnType<typeof usePerformanceLeague>['data']>['items'][number]

const WINDOWS: { days: PerformanceLeagueWindow; label: string }[] = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
]

function compareRows(a: Row, b: Row, field: string): number {
  const av = (a as unknown as Record<string, unknown>)[field]
  const bv = (b as unknown as Record<string, unknown>)[field]
  if (av == null && bv == null) return 0
  if (av == null) return -1
  if (bv == null) return 1
  if (av < bv) return -1
  if (av > bv) return 1
  return 0
}

// Hours under two days read as hours; anything longer reads better in days ("13d", not "300h").
function formatHours(hours: number): string {
  if (hours < 1) return '<1h'
  if (hours < 48) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

// Deliberately no single composite score (recorded judgement, docs/PROGRESS.md §4) — a composite
// hides which thing is wrong and starts an argument about weighting. Sortable columns plus
// threshold-driven red-flag badges instead. One row per active account of one kind — a small,
// bounded set — so search and sort stay client-side. Reworked in the super-admin review
// (2026-09-11): a time window, Sentpo leads only, and flags that are fair to small accounts.
export function PerformanceLeaguePage() {
  const [windowDays, setWindowDays] = useState<PerformanceLeagueWindow>(90)
  const [kind, setKind] = useState<PerformanceLeagueKind>('consultancy')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const league = usePerformanceLeague(windowDays, kind)
  const t = league.data?.thresholds

  // The server already sorts by leads received, most first; a column sort replaces that.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const items = (league.data?.items ?? []).filter((r) => !q || r.consultancy_name.toLowerCase().includes(q))
    if (!sort) return items
    const dir = sort.direction === 'asc' ? 1 : -1
    return [...items].sort((a, b) => compareRows(a, b, sort.field) * dir)
  }, [league.data, sort, search])

  const responseHours = t?.slow_response_hours ?? 48

  const columns: TableColumn<Row>[] = [
    {
      key: 'consultancy_name',
      header: 'Account',
      sortable: true,
      render: (r) => (
        <Link
          to={`/admin/consultancies?manage=${r.consultancy_id}`}
          className="font-medium text-text-primary hover:text-primary hover:underline"
        >
          {r.consultancy_name}
        </Link>
      ),
    },
    { key: 'leads_received', header: 'Sentpo leads', sortable: true, align: 'right', render: (r) => r.leads_received },
    {
      key: 'responded_within_percent',
      header: `Replied within ${responseHours}h`,
      sortable: true,
      align: 'right',
      render: (r) =>
        r.responded_within_percent == null ? (
          <span className="whitespace-nowrap text-text-secondary">Nothing to judge yet</span>
        ) : (
          <span className="flex flex-col items-end">
            <span className="flex items-center gap-xs">
              {r.flags.slow_response && <Badge color="warning">Below {t?.response_target_percent}%</Badge>}
              <span className="font-medium text-text-primary">{Math.round(r.responded_within_percent)}%</span>
            </span>
            {r.response_time_median_hours != null && (
              <span className="text-caption text-text-secondary">
                median {formatHours(r.response_time_median_hours)}
              </span>
            )}
          </span>
        ),
    },
    {
      key: 'conversion_rate_percent',
      header: 'Conversion',
      sortable: true,
      align: 'right',
      render: (r) =>
        r.conversion_rate_percent == null ? (
          <span className="whitespace-nowrap text-text-secondary">None decided</span>
        ) : (
          <span className="flex flex-col items-end">
            <span className="flex items-center gap-xs">
              {r.flags.low_conversion && <Badge color="warning">Below {t?.low_conversion_percent}%</Badge>}
              <span className="font-medium text-text-primary">{Math.round(r.conversion_rate_percent)}%</span>
            </span>
            <span className="text-caption text-text-secondary">of {r.leads_decided} decided</span>
          </span>
        ),
    },
    {
      key: 'active_applicants',
      header: 'Active applicants',
      sortable: true,
      align: 'right',
      render: (r) => r.active_applicants,
    },
    { key: 'enrolled', header: 'Enrolled', sortable: true, align: 'right', render: (r) => r.enrolled },
    {
      key: 'rating',
      header: 'Rating',
      sortable: true,
      align: 'right',
      hideBelow: 'lg',
      render: (r) =>
        r.rating == null ? (
          <span className="whitespace-nowrap text-text-secondary">Not rated</span>
        ) : (
          <span className="flex items-center justify-end gap-xs">
            <span className="font-medium text-text-primary">{r.rating.toFixed(1)}</span>
            {r.rating_count > 0 && <span className="text-caption text-text-secondary">({r.rating_count})</span>}
          </span>
        ),
    },
    {
      key: 'dues_outstanding_inr',
      header: 'Dues outstanding',
      sortable: true,
      align: 'right',
      render: (r) =>
        r.dues_paid_ratio == null ? (
          <span className="whitespace-nowrap text-text-secondary">No dues yet</span>
        ) : (
          <span className="flex flex-col items-end">
            <span className="flex items-center gap-xs">
              {r.flags.unpaid_dues && <Badge color="error">Mostly unpaid</Badge>}
              <span className="whitespace-nowrap font-medium text-text-primary">
                {formatMoney('INR', r.dues_outstanding_inr)}
              </span>
            </span>
            <span className="text-caption text-text-secondary">{Math.round(r.dues_paid_ratio * 100)}% paid</span>
          </span>
        ),
    },
  ]

  const noun = kind === 'institute' ? 'institutes' : 'consultancies'

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-wrap items-center justify-between gap-md">
          <div>
            <h1 className="text-h1 text-text-primary">Performance League</h1>
            <p className="text-body-sm text-text-secondary">
              How each account handles the leads Sentpo sends it. Sort any column; badges mark what needs a look.
            </p>
          </div>
          <div className="flex gap-xs rounded-full border border-border bg-surface p-xs">
            {WINDOWS.map((w) => (
              <button
                key={w.days}
                type="button"
                onClick={() => setWindowDays(w.days)}
                className={`rounded-full px-md py-xs text-body-sm transition-colors ${
                  windowDays === w.days ? 'bg-primary text-text-on-primary' : 'text-text-secondary'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-xs">
          <Table
            columns={columns}
            rows={rows}
            rowKey={(r) => r.consultancy_id}
            loading={league.isLoading}
            error={league.isError ? 'Could not load the performance league.' : undefined}
            emptyMessage={search ? 'No accounts match this search.' : `No active ${noun} yet.`}
            sort={sort}
            onSortChange={(field, direction) => setSort({ field, direction })}
            search={{ value: search, onChange: setSearch, placeholder: 'Search accounts…' }}
            filters={
              <CompactSelect
                value={kind}
                onChange={(e) => setKind(e.target.value as PerformanceLeagueKind)}
                label="Type"
              >
                <option value="consultancy">Consultancies</option>
                <option value="institute">Institutes</option>
              </CompactSelect>
            }
          />
          {t && (
            <p className="text-caption text-text-secondary">
              Leads, replies, conversion and enrolments cover the selected period; active applicants and dues are as of
              today. Suspended accounts are not listed. Conversion is flagged only once {t.min_decided_leads} leads are
              decided.
            </p>
          )}
        </div>
      </div>
    </AdminShell>
  )
}

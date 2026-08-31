import { useMemo, useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Card } from '@/components/Card'
import { Table, type TableColumn } from '@/components/Table'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { usePerformanceLeague } from '@/queries/performanceLeague'
import { formatDate } from '@/lib/time'

type Row = NonNullable<ReturnType<typeof usePerformanceLeague>['data']>['items'][number]

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

// Deliberately no single composite score (recorded judgement, docs/PROGRESS.md §4) — a composite
// hides which thing is wrong and starts an argument about weighting. Sortable columns plus
// threshold-driven red-flag badges instead; this page sorts client-side (no pagination — one row
// per consultancy, a small bounded set) rather than over-engineering server-side sort for it.
export function PerformanceLeaguePage() {
  const league = usePerformanceLeague()
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)

  const rows = useMemo(() => {
    const items = league.data?.items ?? []
    if (!sort) return items
    const dir = sort.direction === 'asc' ? 1 : -1
    return [...items].sort((a, b) => compareRows(a, b, sort.field) * dir)
  }, [league.data, sort])

  if (league.isLoading) {
    return (
      <AdminShell>
        <Skeleton className="h-64 rounded-lg" />
      </AdminShell>
    )
  }

  if (league.isError || !league.data) {
    return (
      <AdminShell>
        <ErrorState message="Could not load the performance league." onRetry={() => league.refetch()} />
      </AdminShell>
    )
  }

  const { thresholds, collecting_since } = league.data

  const columns: TableColumn<Row>[] = [
    {
      key: 'consultancy_name',
      header: 'Consultancy',
      sortable: true,
      render: (r) => <span className="font-medium text-text-primary">{r.consultancy_name}</span>,
    },
    { key: 'leads_received', header: 'Leads received', sortable: true, align: 'right', render: (r) => r.leads_received },
    {
      key: 'response_time_median_hours',
      header: 'Response time (median)',
      sortable: true,
      align: 'right',
      render: (r) =>
        r.response_time_median_hours == null ? (
          <span className="text-text-secondary">No data yet</span>
        ) : (
          <span className="flex items-center justify-end gap-xs">
            {Math.round(r.response_time_median_hours)}h
            {r.flags.slow_response && <Badge color="warning">&gt; {thresholds.slow_response_hours}h</Badge>}
          </span>
        ),
    },
    {
      key: 'conversion_rate_percent',
      header: 'Conversion rate',
      sortable: true,
      align: 'right',
      render: (r) =>
        r.conversion_rate_percent == null ? (
          <span className="text-text-secondary">No data yet</span>
        ) : (
          <span className="flex items-center justify-end gap-xs">
            {r.conversion_rate_percent.toFixed(1)}%
            {r.flags.low_conversion && <Badge color="warning">&lt; {thresholds.low_conversion_percent}%</Badge>}
          </span>
        ),
    },
    { key: 'active_clients', header: 'Active clients', sortable: true, align: 'right', render: (r) => r.active_clients },
    {
      key: 'commission_entries_count',
      header: 'Commission entries',
      sortable: true,
      align: 'right',
      render: (r) => r.commission_entries_count,
    },
    {
      key: 'dues_paid_ratio',
      header: 'Dues paid',
      sortable: true,
      align: 'right',
      render: (r) =>
        r.dues_paid_ratio == null ? (
          <span className="text-text-secondary">No dues yet</span>
        ) : (
          <span className="flex items-center justify-end gap-xs">
            {Math.round(r.dues_paid_ratio * 100)}%
            {r.flags.unpaid_dues && <Badge color="error">Unpaid</Badge>}
          </span>
        ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Performance League</h1>
          <p className="text-body-sm text-text-secondary">
            Per-consultancy operational metrics — no single health score by design; sort any column and read the
            red-flag badges instead.
          </p>
          <p className="mt-xs text-caption text-text-secondary">
            Metrics stabilise as usage history accumulates — collecting since {formatDate(collecting_since)}.
          </p>
        </div>

        <Card>
          <Table
            bare
            columns={columns}
            rows={rows}
            rowKey={(r) => r.consultancy_id}
            emptyMessage="No consultancies yet."
            sort={sort}
            onSortChange={(field, direction) => setSort({ field, direction })}
          />
        </Card>
      </div>
    </AdminShell>
  )
}

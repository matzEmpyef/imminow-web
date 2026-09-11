import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/Card'
import { FilterChip } from '@/components/FilterChip'
import { Table, type TableColumn } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { useFinanceBalances, useFinanceSummary, type ConsultancyBalanceRow } from '@/queries/financeDashboard'
import { FinanceRevenueChart } from './FinanceRevenueChart'
import { FinanceSummaryTiles } from './FinanceSummaryTiles'
import { ConsultancyBalanceDrawer } from './ConsultancyBalanceDrawer'

function inr(n: number | undefined): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

/**
 * The landing tab (2026-09-11 rebuild) — glance tiles, the 12-month chart, and a server-paged
 * balances-by-consultancy table (replacing the old page's every-case-as-a-card list, which does
 * not hold up at hundreds of cases). Row click opens a drawer with that consultancy's own cases and
 * recent payments rather than a second page navigation.
 */
export function OverviewTab({ onGoToAwaiting }: { onGoToAwaiting: () => void }) {
  const summary = useFinanceSummary()
  const [search, setSearch] = useState('')
  const [owingOnly, setOwingOnly] = useState(false)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const paging = useCursorPagination()
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [viewingName, setViewingName] = useState<string | undefined>(undefined)

  const balances = useFinanceBalances({
    search: search || undefined,
    owing: owingOnly || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  function resetPaging() {
    paging.reset()
  }

  const columns: TableColumn<ConsultancyBalanceRow>[] = [
    { key: 'consultancy_name', header: 'Consultancy', sortable: true, render: (r) => r.consultancy_name },
    { key: 'cases', header: 'Cases', sortable: true, align: 'right', render: (r) => <span className="tabular-nums">{r.cases}</span> },
    { key: 'due_inr', header: 'Due', sortable: true, align: 'right', render: (r) => <span className="tabular-nums">{inr(r.due_inr)}</span> },
    { key: 'paid_inr', header: 'Paid', sortable: true, align: 'right', render: (r) => <span className="tabular-nums">{inr(r.paid_inr)}</span> },
    {
      key: 'awaiting_inr',
      header: 'Awaiting',
      sortable: true,
      align: 'right',
      render: (r) => <span className="tabular-nums">{inr(r.awaiting_inr)}</span>,
    },
    {
      key: 'outstanding_inr',
      header: 'Outstanding',
      sortable: true,
      align: 'right',
      render: (r) => <span className="tabular-nums font-medium text-text-primary">{inr(r.outstanding_inr)}</span>,
    },
    {
      key: 'oldest_unpaid_days',
      header: 'Oldest unpaid',
      sortable: true,
      align: 'right',
      hideBelow: 'md',
      render: (r) => <span className="tabular-nums text-text-secondary">{r.oldest_unpaid_days != null ? `${r.oldest_unpaid_days} days` : '—'}</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-lg">
      <FinanceSummaryTiles summary={summary.data} loading={summary.isLoading} onAwaitingClick={onGoToAwaiting} />

      <FinanceRevenueChart months={summary.data?.revenue_by_month} loading={summary.isLoading} />

      {(summary.data?.payment_followups ?? 0) > 0 && (
        <Link to="/admin/case-followups">
          <Card className="flex items-center justify-between gap-md hover:bg-background">
            <p className="text-body-sm text-text-primary">
              Payment follow-ups: <span className="font-medium">{summary.data?.payment_followups}</span> cases to chase
            </p>
            <span className="text-body-sm text-primary">&rarr;</span>
          </Card>
        </Link>
      )}

      <div>
        <h2 className="mb-sm text-h3 text-text-primary">Balances by consultancy</h2>
        <Table
          columns={columns}
          rows={balances.data?.items ?? []}
          rowKey={(r) => r.consultancy_id}
          loading={balances.isLoading}
          error={balances.isError ? 'Could not load consultancy balances.' : undefined}
          emptyMessage={search || owingOnly ? 'No consultancies match these filters.' : 'No consultancies with active cases yet.'}
          onRowClick={(r) => {
            setViewingId(r.consultancy_id)
            setViewingName(r.consultancy_name)
          }}
          sort={sort}
          onSortChange={(field, direction) => {
            setSort({ field, direction })
            resetPaging()
          }}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              resetPaging()
            },
            placeholder: 'Search consultancy…',
          }}
          quickFilters={
            <FilterChip
              label="Only those owing"
              active={owingOnly}
              onChange={(v) => {
                setOwingOnly(v)
                resetPaging()
              }}
            />
          }
          pagination={{
            hasNext: Boolean(balances.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => balances.data?.meta.next_cursor && paging.next(balances.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: balances.data?.meta.total,
          }}
        />
      </div>

      <ConsultancyBalanceDrawer
        consultancyId={viewingId}
        consultancyName={viewingName}
        onClose={() => setViewingId(null)}
      />
    </div>
  )
}

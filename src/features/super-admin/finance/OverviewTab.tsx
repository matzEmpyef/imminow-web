import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/Card'
import { FilterChip } from '@/components/FilterChip'
import { Table } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { useFinanceBalances, useFinanceSummary } from '@/queries/financeDashboard'
import { FinanceRevenueChart } from './FinanceRevenueChart'
import { FinanceSummaryTiles } from './FinanceSummaryTiles'
import { ConsultancyBalanceDrawer } from './ConsultancyBalanceDrawer'
import { balanceColumns } from './balanceColumns'

/**
 * The landing tab (2026-09-11 rebuild) — glance tiles, the 12-month chart, and a server-paged
 * balances-by-consultancy table (replacing the old page's every-case-as-a-card list, which does
 * not hold up at hundreds of cases). Row click opens a drawer with that consultancy's own cases and
 * recent payments rather than a second page navigation.
 */
export function OverviewTab({
  onGoToAwaiting,
  onGoToOverdueCases,
}: {
  onGoToAwaiting: () => void
  onGoToOverdueCases: () => void
}) {
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

  const rows = balances.data?.items ?? []
  const columns = balanceColumns(rows)

  return (
    <div className="flex flex-col gap-lg">
      <FinanceSummaryTiles
        summary={summary.data}
        loading={summary.isLoading}
        onAwaitingClick={onGoToAwaiting}
        onOverdueClick={onGoToOverdueCases}
      />

      <FinanceRevenueChart months={summary.data?.revenue_by_month} loading={summary.isLoading} />

      {/* Kept alongside the new "Flagged cases" glance tile above (product review H5) rather than
          removed — H5 only asked to ADD that tile, and retiring this card is a feature-removal
          call left for a deliberate decision rather than a side effect of adding the new one. */}
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
        <h2 className="mb-sm text-h3 text-text-primary">Balances by consultancy and institute</h2>
        <Table
          columns={columns}
          rows={rows}
          rowKey={(r) => r.consultancy_id}
          loading={balances.isLoading}
          error={balances.isError ? 'Could not load consultancy balances.' : undefined} errorSource={balances.error}
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
        <p className="mt-sm text-caption text-text-secondary">
          Due = Paid − Credit + Waived + Outstanding + Exchange difference. Exchange difference is the change in
          rupee value of foreign-currency dues since each payment was confirmed. Written off is shown beside Due, not
          inside it.
        </p>
      </div>

      <ConsultancyBalanceDrawer
        consultancyId={viewingId}
        consultancyName={viewingName}
        onClose={() => setViewingId(null)}
      />
    </div>
  )
}

import { useMemo, useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { CompactSelect } from '@/components/CompactSelect'
import { Drawer } from '@/components/Drawer'
import { Table, type TableColumn } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate, relativeTime } from '@/lib/time'
import { useCommissionDefaults, useCommissionRatesCoverage, type CommissionRateCoverageRow } from '@/queries/commissionRates'
import { CommissionDefaultsCard } from './rates/CommissionDefaultsCard'
import { CommissionSummaryTiles } from './rates/CommissionSummaryTiles'
import { CommissionAccountDrawer } from './rates/CommissionAccountDrawer'
import { RateEditorModal } from './rates/RateEditorModal'

const COVERAGE_BADGE = {
  complete: { color: 'success', label: 'Complete' },
  partial: { color: 'warning', label: 'Partial' },
  missing: { color: 'error', label: 'Missing' },
  none_served: { color: 'secondary', label: 'No countries' },
} as const

/**
 * Commission Rates, rebuilt 2026-09-11 (user-approved review). The old page loaded the first 100
 * consultancies plus every rate row and counted coverage in the browser: "Rates Configured: 3" just
 * meant "3 countries have ANY rate," so a consultancy serving 5 countries with 3 of them only
 * half-set (some payer types missing) read as finished — and every one of those gaps silently
 * priced cases at a fallback default that was never shown anywhere. It also had two edit paths (an
 * inline per-row Save that swallowed errors and could save a rate as 0 when cleared, plus this
 * matrix popup) and no warning that a rate change only prices cases accepted from then on.
 *
 * This version is server-paged against `/commission-rates/coverage`, which does the complete/
 * partial/missing counting once per account rather than per browser tab, surfaces the fallback
 * default as an editable, explained number (see {@link CommissionDefaultsCard}, opened from the
 * header's "Defaults" summary button rather than sitting on the page — 2026-09-11, kept the header
 * from getting crowded), and keeps exactly one edit path — {@link RateEditorModal} — reachable
 * either from "Set rates" here or from a specific account + country in
 * {@link CommissionAccountDrawer}.
 */
export function CommissionRatesPage() {
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<'' | 'consultancy' | 'institute'>('')
  const [coverage, setCoverage] = useState('')
  const [freelancer, setFreelancer] = useState<'' | 'true' | 'false'>('')
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [settingRates, setSettingRates] = useState(false)
  const [defaultsOpen, setDefaultsOpen] = useState(false)
  const paging = useCursorPagination()
  const defaults = useCommissionDefaults()
  const defaultsSummary = defaults.data
    ? `Defaults · ${defaults.data.consultancy_percent}% · ${defaults.data.freelancer_percent}% freelancer · ${defaults.data.institute_percent}% university · ${defaults.data.payment_terms_days} days`
    : 'Defaults'

  function resetPaging() {
    paging.reset()
  }

  const rows = useCommissionRatesCoverage({
    search: search || undefined,
    kind: kind || undefined,
    coverage: coverage || undefined,
    freelancer: freelancer === '' ? undefined : freelancer === 'true',
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  const gapsActive = coverage === 'partial,missing'

  function toggleGaps() {
    setCoverage(gapsActive ? '' : 'partial,missing')
    resetPaging()
  }

  const viewingRow = useMemo(
    () => (viewingId ? (rows.data?.items ?? []).find((r) => r.consultancy_id === viewingId) : undefined),
    [viewingId, rows.data],
  )

  const columns: TableColumn<CommissionRateCoverageRow>[] = [
    {
      key: 'consultancy_name',
      header: 'Account',
      sortable: true,
      render: (r) => (
        <div>
          <div className="flex items-center gap-xs">
            <span className="font-medium text-text-primary">{r.consultancy_name}</span>
            {r.kind === 'institute' && <Badge color="secondary">University</Badge>}
          </div>
          {r.city && <p className="text-caption text-text-secondary">{r.city}</p>}
        </div>
      ),
    },
    {
      key: 'countries_served',
      header: 'Served countries',
      align: 'right',
      render: (r) => r.countries_served.length,
    },
    {
      key: 'missing_count',
      header: 'Rates',
      sortable: true,
      render: (r) => {
        const badge = COVERAGE_BADGE[r.coverage]
        return (
          <span className="flex items-center gap-xs">
            <span className="tabular-nums text-text-secondary">
              {r.complete_count} of {r.countries_served.length} complete
            </span>
            <Badge color={badge.color}>{badge.label}</Badge>
          </span>
        )
      },
    },
    {
      key: 'default_rate_cases',
      header: 'Default-rate cases',
      sortable: true,
      align: 'right',
      render: (r) => (
        <span className={`tabular-nums ${r.default_rate_cases > 0 ? 'font-medium text-warning' : 'text-text-secondary'}`}>
          {r.default_rate_cases}
        </span>
      ),
    },
    {
      key: 'freelancer',
      header: 'Freelancer',
      render: (r) => <Badge color={r.freelancer_enabled ? 'success' : 'secondary'}>{r.freelancer_enabled ? 'Enabled' : 'Disabled'}</Badge>,
    },
    {
      key: 'last_changed_at',
      header: 'Last changed',
      sortable: true,
      render: (r) =>
        r.last_changed_at ? (
          <div className="flex flex-col">
            <span className="text-text-secondary">{relativeTime(r.last_changed_at)}</span>
            <span className="text-caption text-text-secondary">
              {formatDate(r.last_changed_at)}
              {r.last_changed_by_name ? ` by ${r.last_changed_by_name}` : ''}
            </span>
          </div>
        ) : (
          'Never'
        ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-start justify-between gap-md">
          <div className="min-w-0 flex-1">
            <h1 className="text-h1 text-text-primary">Commission Rates</h1>
            <p className="text-body-sm text-text-secondary">
              What immiNow takes from each case, by consultancy, country and who pays — a % of what the consultancy
              earns on the case. A change applies to cases accepted from then on.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-sm">
            <Button variant="secondary" size="sm" onClick={() => setDefaultsOpen(true)} className="whitespace-nowrap">
              <span className="whitespace-nowrap">{defaultsSummary}</span>
            </Button>
            <Button onClick={() => setSettingRates(true)} className="whitespace-nowrap">
              <span className="whitespace-nowrap">Set rates</span>
            </Button>
          </div>
        </div>

        <CommissionSummaryTiles summary={rows.data?.summary} gapsActive={gapsActive} onToggleGaps={toggleGaps} />

        <Table
          columns={columns}
          rows={rows.data?.items ?? []}
          rowKey={(r) => r.consultancy_id}
          loading={rows.isLoading}
          error={rows.isError ? 'Could not load commission rate coverage.' : undefined}
          emptyMessage="No accounts match these filters."
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
            placeholder: 'Search account or city…',
          }}
          filters={
            <>
              <CompactSelect
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as '' | 'consultancy' | 'institute')
                  resetPaging()
                }}
                label="Type"
              >
                <option value="">All types</option>
                <option value="consultancy">Consultancies</option>
                <option value="institute">Universities</option>
              </CompactSelect>
              <CompactSelect
                value={coverage}
                onChange={(e) => {
                  setCoverage(e.target.value)
                  resetPaging()
                }}
                label="Coverage"
              >
                <option value="">All coverage</option>
                <option value="complete">Complete</option>
                <option value="partial">Partial</option>
                <option value="missing">Missing</option>
                <option value="none_served">No countries served</option>
              </CompactSelect>
              <CompactSelect
                value={freelancer}
                onChange={(e) => {
                  setFreelancer(e.target.value as '' | 'true' | 'false')
                  resetPaging()
                }}
                label="Freelancer"
              >
                <option value="">Any freelancer status</option>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </CompactSelect>
            </>
          }
          onRowClick={(r) => setViewingId(r.consultancy_id)}
          pagination={{
            hasNext: Boolean(rows.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => rows.data?.meta.next_cursor && paging.next(rows.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: rows.data?.meta.total,
          }}
        />

        <CommissionAccountDrawer row={viewingRow ?? null} onClose={() => setViewingId(null)} />
        {settingRates && <RateEditorModal onClose={() => setSettingRates(false)} />}
        <Drawer open={defaultsOpen} onClose={() => setDefaultsOpen(false)} title="When no rate is set">
          <CommissionDefaultsCard variant="drawer" />
        </Drawer>
      </div>
    </AdminShell>
  )
}

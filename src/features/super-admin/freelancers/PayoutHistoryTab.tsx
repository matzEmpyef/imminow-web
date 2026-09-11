import { useState } from 'react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { StopPropagation } from '@/components/StopPropagation'
import { Table, type TableColumn } from '@/components/Table'
import { Toggle } from '@/components/Toggle'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate, localDateISO } from '@/lib/time'
import { fetchAllFreelancerPayouts, useFreelancerPayouts, type FreelancerPayout } from '@/queries/freelancerReferrals'
import { FreelancerFilterSelect } from './FreelancerFilterSelect'
import { VoidPayoutModal } from './VoidPayoutModal'

function inr(n: number | undefined | null): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function toCsv(rows: FreelancerPayout[]): string {
  const header = ['Paid on', 'Freelancer', 'Student', 'Amount INR', 'Reference', 'Recorded by', 'Status', 'Void reason']
  const lines = rows.map((p) =>
    [
      formatDate(p.paid_on),
      p.freelancer_name ?? '',
      p.applicant_name ?? '',
      String(p.amount_inr ?? 0),
      p.reference ?? '',
      p.recorded_by_name ?? '',
      p.voided_at ? 'Undone' : 'Paid',
      p.void_reason ?? '',
    ]
      .map((v) => csvCell(String(v)))
      .join(','),
  )
  return [header.join(','), ...lines].join('\n')
}

/**
 * "Paid & history" — every payout ever recorded, server-paged, mirroring finance/HistoryTab.tsx's
 * shape (2026-09-11): same search/filter/date-range/CSV pattern, applied to freelancer payouts
 * instead of consultancy ones. Undone payouts are hidden unless the "Show undone" chip is on —
 * their amount already went back to owed, so by default this reads as what actually paid out.
 */
export function PayoutHistoryTab() {
  const [search, setSearch] = useState('')
  const [freelancerId, setFreelancerId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showUndone, setShowUndone] = useState(false)
  const [voiding, setVoiding] = useState<FreelancerPayout | null>(null)
  const paging = useCursorPagination()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  function resetPaging() {
    paging.reset()
  }

  const filters = {
    search: search || undefined,
    freelancer_id: freelancerId || undefined,
    from: from || undefined,
    to: to || undefined,
    voided: showUndone ? undefined : false,
  }

  const payouts = useFreelancerPayouts({ ...filters, cursor: paging.cursor, limit: 20 })

  async function handleDownload() {
    setExporting(true)
    setExportError(null)
    try {
      const rows = await fetchAllFreelancerPayouts(filters)
      const csv = toCsv(rows)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `freelancer-payouts-${localDateISO()}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setExportError('Could not export payout history.')
    } finally {
      setExporting(false)
    }
  }

  const columns: TableColumn<FreelancerPayout>[] = [
    { key: 'paid_on', header: 'Paid on', render: (p) => formatDate(p.paid_on) },
    { key: 'freelancer', header: 'Freelancer', render: (p) => p.freelancer_name ?? '—' },
    { key: 'applicant', header: 'Student', hideBelow: 'md', render: (p) => p.applicant_name ?? '—' },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (p) => <span className="whitespace-nowrap font-medium tabular-nums text-text-primary">{inr(p.amount_inr)}</span>,
    },
    { key: 'reference', header: 'Reference', hideBelow: 'lg', render: (p) => p.reference ?? '—' },
    { key: 'recorded_by', header: 'Recorded by', hideBelow: 'lg', render: (p) => p.recorded_by_name ?? '—' },
    {
      key: 'status',
      header: 'Status',
      render: (p) =>
        p.voided_at ? (
          <span title={p.void_reason ?? undefined}>
            <Badge color="secondary">Undone</Badge>
          </span>
        ) : (
          <Badge color="success">Paid</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) =>
        !p.voided_at && (
          <StopPropagation>
            <Button variant="secondary" size="sm" onClick={() => setVoiding(p)}>
              Undo
            </Button>
          </StopPropagation>
        ),
    },
  ]

  const totals = payouts.data?.totals
  const anyFilter = Boolean(search || freelancerId || from || to || showUndone)

  return (
    <div className="flex flex-col gap-md">
      <div className="flex items-center justify-between gap-md">
        {totals && (
          <p className="text-body-sm text-text-secondary">
            {totals.count ?? 0} payouts · {inr(totals.amount_inr)} for these filters
          </p>
        )}
        <div className="ml-auto flex items-center gap-sm">
          {exportError && <p className="text-body-sm text-error">{exportError}</p>}
          <Button variant="secondary" size="sm" disabled={exporting} onClick={handleDownload}>
            {exporting ? 'Preparing…' : 'Download CSV'}
          </Button>
        </div>
      </div>
      <Table
        columns={columns}
        rows={payouts.data?.items ?? []}
        rowKey={(p) => p.id}
        loading={payouts.isLoading}
        error={payouts.isError ? 'Could not load payout history.' : undefined}
        emptyMessage={anyFilter ? 'No payouts match these filters.' : 'No payouts recorded yet.'}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value)
            resetPaging()
          },
          placeholder: 'Search reference, freelancer or student…',
        }}
        filters={
          <>
            <FreelancerFilterSelect
              value={freelancerId}
              onChange={(id) => {
                setFreelancerId(id)
                resetPaging()
              }}
            />
            <input
              type="date"
              aria-label="From"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                resetPaging()
              }}
              className="h-10 rounded-md border border-border bg-background px-3 text-body-sm text-text-primary outline-none focus:border-primary"
            />
            <input
              type="date"
              aria-label="To"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                resetPaging()
              }}
              className="h-10 rounded-md border border-border bg-background px-3 text-body-sm text-text-primary outline-none focus:border-primary"
            />
          </>
        }
        filterActions={
          // A Toggle, not a FilterChip (platform convention): this WIDENS the list to include
          // undone payouts that are otherwise excluded by default, rather than narrowing it.
          <label htmlFor="payouts-show-undone" className="flex items-center gap-sm text-body-sm text-text-secondary">
            <Toggle
              id="payouts-show-undone"
              checked={showUndone}
              onChange={(v) => {
                setShowUndone(v)
                resetPaging()
              }}
              label="Show undone"
            />
            Show undone
          </label>
        }
        pagination={{
          hasNext: Boolean(payouts.data?.meta.next_cursor),
          hasPrevious: paging.hasPrevious,
          onNext: () => payouts.data?.meta.next_cursor && paging.next(payouts.data.meta.next_cursor),
          onPrevious: paging.previous,
          total: payouts.data?.meta.total,
        }}
      />

      {voiding && <VoidPayoutModal payout={voiding} onClose={() => setVoiding(null)} />}
    </div>
  )
}

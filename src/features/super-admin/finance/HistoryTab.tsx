import { useState } from 'react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { CompactSelect } from '@/components/CompactSelect'
import { StopPropagation } from '@/components/StopPropagation'
import { Table, type TableColumn } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate, localDateISO } from '@/lib/time'
import { money } from './money'
import { fetchAllFinancePayments, useFinancePayments } from '@/queries/financeDashboard'
import type { CommissionPayment } from '@/queries/commission'
import { ConsultancySearchSelect } from './ConsultancySearchSelect'
import { CorrectPaymentModal } from './CorrectPaymentModal'


type StatusFilter = '' | 'confirmed' | 'rejected'

function approxInr(amountInr: number | undefined, currency: string | undefined): string | null {
  if (!currency || currency === 'INR' || amountInr == null) return null
  return `≈ ₹${amountInr.toLocaleString('en-IN')}`
}

function csvCell(value: string): string {
  // Quote any field that could otherwise break a column boundary or start a new row.
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function toCsv(rows: CommissionPayment[]): string {
  const header = ['Date', 'Status', 'Amount INR', 'Consultancy', 'Student', 'Reference', 'Declared', 'Confirmed/Rejected', 'By', 'Reason']
  const lines = rows.map((p) => {
    const settledAt = p.status === 'confirmed' ? p.confirmed_at : p.status === 'rejected' ? p.rejected_at : null
    const by = p.status === 'confirmed' ? p.confirmed_by_name : p.status === 'rejected' ? p.rejected_by_name : null
    return [
      settledAt ? formatDate(settledAt) : formatDate(p.recorded_at),
      p.status,
      String(p.amount.amount ?? 0),
      p.consultancy_name ?? 'Unknown',
      p.applicant_name ?? 'General',
      p.transaction_id ?? '',
      formatDate(p.recorded_at),
      settledAt ? formatDate(settledAt) : '',
      by ?? '',
      p.reject_reason ?? '',
    ]
      .map((v) => csvCell(String(v)))
      .join(',')
  })
  return [header.join(','), ...lines].join('\n')
}

function statusFilterValue(status: StatusFilter): string {
  return status === '' ? 'confirmed,rejected' : status
}

/**
 * Every settled (confirmed or rejected) payment, server-paged (2026-09-11 rebuild). "Download CSV"
 * loops every page for the current filters at the server's max page size — the point of this whole
 * rebuild was that the platform expects hundreds of payments, more than this page ever renders at
 * once, so the export can't just serialize what's currently on screen.
 */
export function HistoryTab() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [consultancyId, setConsultancyId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const paging = useCursorPagination()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [correcting, setCorrecting] = useState<CommissionPayment | null>(null)

  function resetPaging() {
    paging.reset()
  }

  const filters = {
    search: search || undefined,
    status: statusFilterValue(status),
    consultancy_id: consultancyId || undefined,
    from: from || undefined,
    to: to || undefined,
  }

  const payments = useFinancePayments({ ...filters, cursor: paging.cursor, limit: 20 })

  async function handleDownload() {
    setExporting(true)
    setExportError(null)
    try {
      const rows = await fetchAllFinancePayments(filters)
      const csv = toCsv(rows)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `payment-history-${localDateISO()}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setExportError('Could not export payment history.')
    } finally {
      setExporting(false)
    }
  }

  const columns: TableColumn<CommissionPayment>[] = [
    {
      key: 'amount',
      header: 'Amount',
      render: (p) => (
        <div className="flex flex-col">
          <span className="flex items-center gap-xs whitespace-nowrap font-medium tabular-nums text-text-primary">
            {money(p.amount)}
            {(p.corrections?.length ?? 0) > 0 && <Badge color="info">Corrected</Badge>}
            {/* Recorded directly by Finance, no declaration from the consultancy (2026-09-11). */}
            {p.recorded_by_finance && <Badge color="secondary">Recorded by Finance</Badge>}
          </span>
          {/* declared_amount is only ever set when it differs from what arrived (2026-09-11) — see
              CommissionPayment's doc comment. */}
          {p.declared_amount && (
            <span className="whitespace-nowrap text-caption text-text-secondary">Declared {money(p.declared_amount)}</span>
          )}
          {p.recorded_by_finance && p.received_on && (
            <span className="whitespace-nowrap text-caption text-text-secondary">Received {formatDate(p.received_on)}</span>
          )}
          {approxInr(p.amount_inr, p.amount.currency) && (
            <span className="whitespace-nowrap text-caption text-text-secondary">{approxInr(p.amount_inr, p.amount.currency)}</span>
          )}
        </div>
      ),
    },
    { key: 'consultancy', header: 'Consultancy', render: (p) => p.consultancy_name ?? 'Unknown' },
    { key: 'case', header: 'Case', render: (p) => p.applicant_name ?? 'General' },
    { key: 'reference', header: 'Reference', hideBelow: 'md', render: (p) => p.transaction_id ?? '—' },
    {
      key: 'status',
      header: 'Status',
      render: (p) =>
        p.status === 'confirmed' ? (
          <Badge color="success">Confirmed</Badge>
        ) : (
          <span title={p.reject_reason ?? undefined}>
            <Badge color="error">Rejected</Badge>
          </span>
        ),
    },
    { key: 'declared', header: 'Declared', hideBelow: 'sm', render: (p) => formatDate(p.recorded_at) },
    {
      key: 'settled',
      header: 'Confirmed/Rejected',
      render: (p) => {
        const at = p.status === 'confirmed' ? p.confirmed_at : p.rejected_at
        return at ? formatDate(at) : '—'
      },
    },
    {
      key: 'by',
      header: 'By',
      hideBelow: 'lg',
      render: (p) => (p.status === 'confirmed' ? p.confirmed_by_name : p.rejected_by_name) ?? '—',
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) =>
        p.status === 'confirmed' ? (
          <StopPropagation>
            <Button size="sm" variant="secondary" onClick={() => setCorrecting(p)}>
              Correct amount
            </Button>
          </StopPropagation>
        ) : null,
    },
  ]

  const totals = payments.data?.totals
  const anyFilter = Boolean(search || status || consultancyId || from || to)

  return (
    <div className="flex flex-col gap-md">
      <div className="flex items-center justify-between gap-md">
        {totals && (
          <p className="text-body-sm text-text-secondary">
            {totals.count ?? 0} payments · ₹{(totals.amount_inr ?? 0).toLocaleString('en-IN')} for these filters
          </p>
        )}
        <div className="ml-auto flex items-center gap-sm">
          {exportError && <p className="text-body-sm text-error">{exportError}</p>}
          {/* Not the `loading` prop (Button always swaps its label to "Please wait…" while loading) —
              this action's own "Preparing…" state is more specific about what's happening. */}
          <Button variant="secondary" size="sm" disabled={exporting} onClick={handleDownload}>
            {exporting ? 'Preparing…' : 'Download CSV'}
          </Button>
        </div>
      </div>
      <Table
        columns={columns}
        rows={payments.data?.items ?? []}
        rowKey={(p) => p.id}
        loading={payments.isLoading}
        error={payments.isError ? 'Could not load payment history.' : undefined}
        emptyMessage={anyFilter ? 'No payments match these filters.' : 'No settled payments yet.'}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value)
            resetPaging()
          },
          placeholder: 'Search reference, consultancy or student…',
        }}
        filters={
          <>
            <CompactSelect
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as StatusFilter)
                resetPaging()
              }}
              label="Status"
            >
              <option value="">All</option>
              <option value="confirmed">Confirmed</option>
              <option value="rejected">Rejected</option>
            </CompactSelect>
            <ConsultancySearchSelect
              value={consultancyId}
              onChange={(id) => {
                setConsultancyId(id)
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
        pagination={{
          hasNext: Boolean(payments.data?.meta.next_cursor),
          hasPrevious: paging.hasPrevious,
          onNext: () => payments.data?.meta.next_cursor && paging.next(payments.data.meta.next_cursor),
          onPrevious: paging.previous,
          total: payments.data?.meta.total,
        }}
      />

      {correcting && <CorrectPaymentModal payment={correcting} onClose={() => setCorrecting(null)} />}
    </div>
  )
}

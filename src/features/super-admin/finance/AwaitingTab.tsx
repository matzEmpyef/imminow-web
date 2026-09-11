import { useMemo, useState } from 'react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { StopPropagation } from '@/components/StopPropagation'
import { Table, type TableColumn } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate, relativeTime } from '@/lib/time'
import { money } from './money'
import { useFinancePayments } from '@/queries/financeDashboard'
import type { CommissionPayment } from '@/queries/commission'
import { ConfirmPaymentModal } from './ConfirmPaymentModal'
import { RejectPaymentModal } from './RejectPaymentModal'
import { BulkConfirmModal } from './BulkConfirmModal'


function inr(n: number | null | undefined): string {
  return n == null ? '—' : `₹${n.toLocaleString('en-IN')}`
}

function daysWaiting(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

/**
 * The confirm queue (2026-09-11 rebuild) — every consultancy-declared payment not yet acted on,
 * server-paged with selection for bulk confirms. Nothing here happens by accident: a single
 * Confirm/Reject opens its own modal, and the bulk path lists exactly what it's about to confirm
 * before it runs.
 */
export function AwaitingTab() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const paging = useCursorPagination()
  const [confirming, setConfirming] = useState<CommissionPayment | null>(null)
  const [rejecting, setRejecting] = useState<CommissionPayment | null>(null)
  const [bulkConfirming, setBulkConfirming] = useState(false)

  const payments = useFinancePayments({ status: 'declared', cursor: paging.cursor, limit: 20 })
  const rows = useMemo(() => payments.data?.items ?? [], [payments.data])
  const selectedRows = rows.filter((r) => selected.has(r.id))
  const selectedTotal = selectedRows.reduce((sum, p) => sum + (p.amount.amount ?? 0), 0)

  const columns: TableColumn<CommissionPayment>[] = [
    {
      key: 'amount',
      header: 'Amount',
      render: (p) => <span className="whitespace-nowrap font-medium tabular-nums text-text-primary">{money(p.amount)}</span>,
    },
    { key: 'consultancy', header: 'Consultancy', render: (p) => p.consultancy_name ?? 'Unknown' },
    { key: 'case', header: 'Case', render: (p) => p.applicant_name ?? 'General' },
    {
      key: 'entry_outstanding',
      header: 'Case still owes',
      align: 'right',
      render: (p) => {
        const overpays = (p.amount.amount ?? 0) > (p.entry_outstanding_inr ?? Infinity)
        return (
          <span className="flex items-center justify-end gap-xs">
            {inr(p.entry_outstanding_inr)}
            {overpays && <Badge color="warning">More than owed</Badge>}
          </span>
        )
      },
    },
    { key: 'reference', header: 'Reference', hideBelow: 'md', render: (p) => p.transaction_id ?? '—' },
    {
      key: 'declared',
      header: 'Declared',
      hideBelow: 'sm',
      render: (p) => (
        <div className="flex flex-col">
          <span className="text-text-secondary">{relativeTime(p.recorded_at)}</span>
          <span className="text-caption text-text-secondary">{formatDate(p.recorded_at)}</span>
        </div>
      ),
    },
    {
      key: 'waiting',
      header: 'Waiting',
      align: 'right',
      render: (p) => <span className="tabular-nums text-text-secondary">{daysWaiting(p.recorded_at)} days</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <StopPropagation>
          <div className="flex justify-end gap-xs">
            <Button size="sm" onClick={() => setConfirming(p)}>
              Confirm
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRejecting(p)}>
              Reject
            </Button>
          </div>
        </StopPropagation>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-md">
      <Table
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        loading={payments.isLoading}
        error={payments.isError ? 'Could not load payments awaiting confirmation.' : undefined}
        emptyMessage="Nothing awaiting confirmation."
        selection={{
          selectedIds: selected,
          onToggle: (id) =>
            setSelected((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            }),
          onToggleAll: (ids) => setSelected(new Set(ids)),
        }}
        filters={
          selected.size > 0 && (
            <div className="flex items-center gap-sm">
              <Button size="sm" onClick={() => setBulkConfirming(true)}>
                Confirm {selected.size} selected (₹{selectedTotal.toLocaleString('en-IN')})
              </Button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-md px-sm py-xs text-body-sm text-text-secondary hover:bg-background hover:text-text-primary"
              >
                Clear
              </button>
            </div>
          )
        }
        pagination={{
          hasNext: Boolean(payments.data?.meta.next_cursor),
          hasPrevious: paging.hasPrevious,
          onNext: () => payments.data?.meta.next_cursor && paging.next(payments.data.meta.next_cursor),
          onPrevious: paging.previous,
          total: payments.data?.meta.total,
        }}
      />

      {confirming && <ConfirmPaymentModal payment={confirming} onClose={() => setConfirming(null)} />}
      {rejecting && <RejectPaymentModal payment={rejecting} onClose={() => setRejecting(null)} />}
      {bulkConfirming && (
        <BulkConfirmModal
          payments={selectedRows}
          onClose={() => setBulkConfirming(false)}
          onDone={() => setSelected(new Set())}
        />
      )}
    </div>
  )
}

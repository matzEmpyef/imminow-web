import { useState, type FormEvent } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Table, type TableColumn } from '@/components/Table'
import { CompactSelect } from '@/components/CompactSelect'
import { Modal } from '@/components/Modal'
import { useCreateReceipt, useInvoices, useReceipts, useVoidReceipt } from '@/queries/invoicing'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'
import { formatMoneyAmount } from '@/lib/money'

type Receipt = NonNullable<ReturnType<typeof useReceipts>['data']>['items'][number]

// User-requested (2026-08-15) — "wherever there is add button, use popup, instead of inline
// form." Was an inline Card that expanded below the page header; now a Modal, same fields.
function RecordReceiptForm({ onClose }: { onClose: () => void }) {
  // T2: the dropdown is every open invoice, not page one — default limit 20 hid invoice 21.
  const invoices = useInvoices({ limit: 100 })
  const createReceipt = useCreateReceipt()
  // T1: one key per modal open.
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [invoiceId, setInvoiceId] = useState('')
  const [amount, setAmount] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // T1 (third-pass review): Enter-Enter before the button's loading state painted recorded the
    // payment twice — money mutations get the same pending guard as the N7 fix.
    if (createReceipt.isPending) return
    if (!invoiceId || !amount) return
    createReceipt.mutate({ invoice_id: invoiceId, amount: Number(amount), idempotencyKey }, { onSuccess: onClose })
  }

  const unvoidInvoices = invoices.data?.items.filter((i) => i.status !== 'void') ?? []

  return (
    <Modal
      onClose={onClose}
      title="Record a Payment"
      widthRem={28}
      footer={
        <>
          {createReceipt.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{createReceipt.error.message}</p>
          )}
          <Button type="submit" form="record-receipt-form" loading={createReceipt.isPending}>
            Record Payment
          </Button>
        </>
      }
    >
      <form id="record-receipt-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <SelectField
          label="Invoice"
          id="receipt-invoice"
          value={invoiceId}
          onChange={(e) => setInvoiceId(e.target.value)}
        >
          <option value="">Select…</option>
          {unvoidInvoices.map((inv) => (
            <option key={inv.id} value={inv.id}>
              {inv.number} — {inv.applicant_name} ({formatMoneyAmount(inv.amount)})
            </option>
          ))}
        </SelectField>
        <TextField label="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </form>
    </Modal>
  )
}

export function ReceiptsPage() {
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'recorded' | 'void' | ''>('')
  const paging = useCursorPagination()

  const receipts = useReceipts({
    status: status || undefined,
    search: search || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })
  const voidReceipt = useVoidReceipt()
  const [showForm, setShowForm] = useState(false)
  const [voidingId, setVoidingId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')

  function resetPaging() {
    paging.reset()
  }

  const columns: TableColumn<Receipt>[] = [
    {
      key: 'applicant_name',
      header: 'Invoice',
      sortable: true,
      render: (r) => (
        <span className="text-text-primary">
          {r.invoice_number} — {r.applicant_name}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      align: 'right',
      render: (r) => formatMoneyAmount(r.amount),
    },
    { key: 'recorded_at', header: 'Recorded', sortable: true, render: (r) => formatDate(r.recorded_at) },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge color={r.status === 'void' ? 'secondary' : 'success'}>{r.status}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (r) =>
        r.status !== 'void' && (
          <div className="flex items-center justify-end gap-xs">
            {voidingId === r.id ? (
              <>
                <input
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Reason…"
                  className="h-8 w-32 rounded-md border border-border bg-surface px-2 text-caption"
                />
                <Button
                  variant="destructive"
                  disabled={!voidReason}
                  loading={voidReceipt.isPending}
                  onClick={() =>
                    voidReceipt.mutate(
                      { id: r.id, reason: voidReason },
                      {
                        onSuccess: () => {
                          setVoidingId(null)
                          setVoidReason('')
                        },
                      },
                    )
                  }
                  className="h-8 px-3 text-caption"
                >
                  Confirm
                </Button>
              </>
            ) : (
              <button onClick={() => setVoidingId(r.id)} className="text-caption text-error hover:underline">
                Void
              </button>
            )}
          </div>
        ),
    },
  ]

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-h1 text-text-primary">Receipts</h1>
          <Button onClick={() => setShowForm(true)}>Record a Payment</Button>
        </div>

        {showForm && <RecordReceiptForm onClose={() => setShowForm(false)} />}

        <Table
          columns={columns}
          rows={receipts.data?.items ?? []}
          rowKey={(r) => r.id}
          loading={receipts.isLoading}
          error={receipts.isError ? 'Could not load receipts.' : undefined}
          emptyMessage="No receipts recorded yet."
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
            placeholder: 'Search invoice or applicant…',
          }}
          filters={
            <CompactSelect
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as typeof status)
                resetPaging()
              }}
              label="Status"
              className="capitalize"
            >
              <option value="">Any status</option>
              <option value="recorded">Recorded</option>
              <option value="void">Void</option>
            </CompactSelect>
          }
          pagination={{
            hasNext: Boolean(receipts.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => receipts.data?.meta.next_cursor && paging.next(receipts.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: receipts.data?.meta.total,
          }}
        />
      </div>
    </AppShell>
  )
}

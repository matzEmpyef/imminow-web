import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '@/features/auth/AppShell'
import { PermissionGate } from '@/features/auth/PermissionGate'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Drawer } from '@/components/Drawer'
import { TextField } from '@/components/TextField'
import { Table, type TableColumn } from '@/components/Table'
import { CompactSelect } from '@/components/CompactSelect'
import { SearchSelect } from '@/components/SearchSelect'
import { StopPropagation } from '@/components/StopPropagation'
import { Modal } from '@/components/Modal'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useClients } from '@/queries/clients'
import { useMyConsultancy } from '@/queries/consultancy'
import { useCreateInvoice, useInvoices, useReceipts, useVoidInvoice } from '@/queries/invoicing'
import { useCursorPagination } from '@/lib/pagination'
import { usePermission } from '@/lib/permissions'
import { formatDate } from '@/lib/time'
import { formatMoneyAmount } from '@/lib/money'
import { showToast } from '@/lib/toast'

// C4 (2026-09-13): `part_paid` is derived by the server from the receipts recorded against the
// invoice, so the list now has a fourth thing to say between "sent" and "paid" — warning, because
// a part-paid invoice is the one that still needs chasing. Labels are spelled here rather than
// capitalising the wire value, since "Part paid" is not what `part_paid` title-cases to.
const STATUS_COLOR: Record<string, 'info' | 'success' | 'error' | 'secondary' | 'warning'> = {
  draft: 'secondary',
  sent: 'info',
  part_paid: 'warning',
  paid: 'success',
  overdue: 'error',
  void: 'secondary',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  part_paid: 'Part paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
}

type Invoice = NonNullable<ReturnType<typeof useInvoices>['data']>['items'][number]

function StatusBadge({ status }: { status: Invoice['status'] }) {
  return <Badge color={STATUS_COLOR[status] ?? 'secondary'}>{STATUS_LABEL[status] ?? status}</Badge>
}

// Void asks for a reason inline, then confirms. Extracted (C4) so the row and the detail drawer
// are the same control rather than two copies that drift — each instance owns its own reason.
function VoidInvoiceControl({ invoice, onVoided }: { invoice: Invoice; onVoided?: () => void }) {
  const voidInvoice = useVoidInvoice()
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="text-caption text-error hover:underline">
        Void
      </button>
    )
  }
  return (
    <>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason…"
        aria-label="Reason for voiding"
        className="h-8 w-32 rounded-md border border-border bg-surface px-sm text-caption"
      />
      <Button
        variant="destructive"
        disabled={!reason}
        loading={voidInvoice.isPending}
        onClick={() =>
          voidInvoice.mutate(
            { id: invoice.id, reason },
            {
              onSuccess: () => {
                setConfirming(false)
                setReason('')
                onVoided?.()
              },
            },
          )
        }
        className="h-8 px-3 text-caption"
      >
        Confirm
      </Button>
    </>
  )
}

// The invoice as a document rather than a row (C4): what was billed, what has been paid against
// it, and the receipts that make up that figure — which until now lived on a separate page with
// no way back to the invoice it belonged to.
function InvoiceDrawer({
  invoice,
  canRecordPayment,
  onClose,
}: {
  invoice: Invoice
  canRecordPayment: boolean
  onClose: () => void
}) {
  // Server-side filter (GET /receipts?invoice_id=) rather than fetching the whole ledger and
  // sieving it here — the endpoint already supports it, and a consultancy's receipt list grows.
  const receipts = useReceipts({ invoiceId: invoice.id, limit: 100 })
  const rows = receipts.data?.items ?? []

  return (
    <Drawer open onClose={onClose} title={`Invoice ${invoice.number}`} dismissible>
      <div className="flex flex-col gap-md">
        <div className="flex items-start justify-between gap-sm">
          <div>
            <p className="text-caption text-text-secondary">Applicant</p>
            <Link
              to={`/clients/${invoice.journey_id}`}
              className="text-body text-text-primary hover:text-primary hover:underline"
            >
              {invoice.applicant_name}
            </Link>
          </div>
          <StatusBadge status={invoice.status} />
        </div>

        <dl className="grid grid-cols-2 gap-sm text-body-sm">
          <div>
            <dt className="text-caption text-text-secondary">Issued</dt>
            <dd className="text-text-primary">{formatDate(invoice.created_at)}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Due</dt>
            {/* The contract carries no due date on an invoice yet — said plainly rather than
                inventing one from the issue date. */}
            <dd className="text-text-secondary">Not set</dd>
          </div>
        </dl>

        <div>
          <p className="text-body-sm font-medium text-text-primary">Line Items</p>
          <ul className="mt-xs flex flex-col gap-xs">
            {(invoice.line_items ?? []).map((item, i) => (
              <li key={i} className="flex items-start justify-between gap-sm text-body-sm">
                <span className="text-text-secondary">{item.description}</span>
                <span className="shrink-0 tabular-nums text-text-primary">
                  {formatMoneyAmount({ amount: item.amount, currency: invoice.amount.currency })}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <dl className="flex flex-col gap-xs border-t border-border pt-sm text-body-sm">
          <div className="flex items-center justify-between">
            <dt className="text-text-secondary">Total</dt>
            <dd className="tabular-nums text-text-primary">{formatMoneyAmount(invoice.amount)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-text-secondary">Paid</dt>
            <dd className="tabular-nums text-text-primary">{formatMoneyAmount(invoice.paid_amount)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-text-secondary">Balance due</dt>
            <dd className="tabular-nums font-medium text-text-primary">{formatMoneyAmount(invoice.balance_due)}</dd>
          </div>
        </dl>

        <div className="border-t border-border pt-sm">
          <p className="text-body-sm font-medium text-text-primary">Payments Recorded</p>
          {receipts.isLoading ? (
            <Skeleton className="mt-xs h-12 rounded-md" />
          ) : receipts.isError ? (
            <ErrorState message="Could not load the payments against this invoice." onRetry={() => receipts.refetch()} />
          ) : rows.length === 0 ? (
            <p className="mt-xs text-body-sm text-text-secondary">Nothing recorded against this invoice yet.</p>
          ) : (
            <ul className="mt-xs flex flex-col gap-xs">
              {rows.map((receipt) => (
                <li key={receipt.id} className="flex items-center justify-between gap-sm text-body-sm">
                  <span className="text-text-secondary">{formatDate(receipt.recorded_at)}</span>
                  <span className="flex items-center gap-sm">
                    {receipt.status === 'void' && <Badge color="secondary">Void</Badge>}
                    <span className="tabular-nums text-text-primary">{formatMoneyAmount(receipt.amount)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canRecordPayment && invoice.status !== 'void' && (
          <div className="flex items-center justify-end gap-xs border-t border-border pt-sm">
            <VoidInvoiceControl invoice={invoice} onVoided={onClose} />
          </div>
        )}
        {invoice.void_reason && (
          <p className="text-body-sm text-text-secondary">Voided — {invoice.void_reason}</p>
        )}
      </div>
    </Drawer>
  )
}

interface LineItem {
  description: string
  amount: string
}

// User-requested (2026-08-15) — "wherever there is add button, use popup, instead of inline
// form." Was an inline Card that expanded below the page header; now a Modal, same fields.
function CreateInvoiceForm({ onClose }: { onClose: () => void }) {
  // T2: this SearchSelect is the complete billing roster, not page one of it — the default
  // limit of 20 made applicant 21 unbillable from this modal.
  const clients = useClients({ limit: 100 })
  const createInvoice = useCreateInvoice()
  // T1: one key per modal open.
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  // Display only — the server derives the real currency from consultancy.country. Shown so the
  // consultant knows what they are billing in before they submit.
  const consultancy = useMyConsultancy()
  const invoiceCurrency = consultancy.data?.billing_currency ?? null
  const [journeyId, setJourneyId] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: '', amount: '' }])

  function updateItem(i: number, patch: Partial<LineItem>) {
    setLineItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, ...patch } : item)))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // T1 (third-pass review): a double-submit before the button disabled created two invoices —
    // same pending guard as the N7 payment fix. The Idempotency-Key header will join when the
    // contract grows it on this POST; until then this guard is the protection.
    if (createInvoice.isPending) return
    const items = lineItems
      .filter((li) => li.description && li.amount)
      .map((li) => ({ description: li.description, amount: Number(li.amount) }))
    if (!journeyId || items.length === 0) return
    const applicant = clients.data?.items.find((c) => c.id === journeyId)
    createInvoice.mutate(
      { journey_id: journeyId, line_items: items, idempotencyKey },
      {
        onSuccess: () => {
          showToast(applicant ? `Invoice created for ${applicant.student.first_name} ${applicant.student.last_name}` : 'Invoice created')
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Create Invoice"
      widthRem={32}
      footer={
        <>
          {createInvoice.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{createInvoice.error.message}</p>
          )}
          <Button type="submit" form="create-invoice-form" loading={createInvoice.isPending}>
            Create Invoice
          </Button>
        </>
      }
    >
      <form id="create-invoice-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <div className="flex flex-col gap-xs">
          <SearchSelect
            id="invoice-applicant"
            label="Applicant"
            options={(clients.data?.items ?? []).map((c) => ({
              id: c.id,
              label: `${c.student.first_name} ${c.student.last_name}`,
            }))}
            value={journeyId}
            onChange={setJourneyId}
            placeholder="Search applicants…"
          />
        </div>

        <div className="flex flex-col gap-sm">
          <p className="text-body-sm font-medium text-text-primary">Line Items</p>
          {lineItems.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-sm">
              <TextField
                label="Description"
                value={item.description}
                onChange={(e) => updateItem(i, { description: e.target.value })}
              />
              <TextField
                // Currency follows the consultancy country, so a fixed "(INR)" here lied to
                // everyone outside India — the invoice it produced was already CAD/GBP/etc.
                label={`Amount${invoiceCurrency ? ` (${invoiceCurrency})` : ''}`}
                type="number"
                value={item.amount}
                onChange={(e) => updateItem(i, { amount: e.target.value })}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            className="w-fit"
            onClick={() => setLineItems((prev) => [...prev, { description: '', amount: '' }])}
          >
            Add Line Item
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function InvoicesPage() {
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'sent' | 'paid' | 'overdue' | 'void' | ''>('')
  const paging = useCursorPagination()

  const invoices = useInvoices({
    status: status || undefined,
    search: search || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })
  // C3 (2026-09-13): creating and voiding are `billing.record_payment` server-side, while merely
  // reading this list is `billing.view_commission_details` — the two are no longer the same thing.
  const canRecordPayment = usePermission('billing.record_payment')
  const [showForm, setShowForm] = useState(false)
  // The invoice whose detail drawer is open, re-read from the freshest page data below so that
  // voiding (or a payment landing) updates the open drawer instead of freezing a stale copy.
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null)

  function resetPaging() {
    paging.reset()
  }

  const rows = invoices.data?.items ?? []
  const openInvoice = rows.find((inv) => inv.id === openInvoiceId) ?? null

  const columns: TableColumn<Invoice>[] = [
    {
      key: 'number',
      header: 'Number',
      sortable: true,
      render: (inv) => <span className="font-medium text-text-primary">{inv.number}</span>,
    },
    {
      key: 'applicant_name',
      header: 'Applicant',
      sortable: true,
      // StopPropagation: the row opens the drawer now, and the applicant's name still has to mean
      // "go to the applicant" rather than both at once.
      render: (inv) => (
        <StopPropagation>
          <Link to={`/clients/${inv.journey_id}`} className="text-text-primary hover:text-primary hover:underline">
            {inv.applicant_name}
          </Link>
        </StopPropagation>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      align: 'right',
      render: (inv) => formatMoneyAmount(inv.amount),
    },
    // C4: the list used to show what was billed and nothing about what came back, so an invoice
    // half-settled looked identical to one nobody had paid.
    {
      key: 'paid_amount',
      header: 'Paid',
      align: 'right',
      render: (inv) => <span className="tabular-nums">{formatMoneyAmount(inv.paid_amount)}</span>,
    },
    {
      key: 'balance_due',
      header: 'Balance due',
      align: 'right',
      render: (inv) => <span className="tabular-nums">{formatMoneyAmount(inv.balance_due)}</span>,
    },
    { key: 'created_at', header: 'Created', sortable: true, render: (inv) => formatDate(inv.created_at) },
    { key: 'status', header: 'Status', render: (inv) => <StatusBadge status={inv.status} /> },
    {
      key: 'actions',
      header: '',
      render: (inv) =>
        canRecordPayment &&
        inv.status !== 'void' && (
          <StopPropagation className="flex items-center justify-end gap-xs">
            <VoidInvoiceControl invoice={inv} />
          </StopPropagation>
        ),
    },
  ]

  return (
    // Repeated from the route's own gate (App.tsx) so the page is self-protecting however it is
    // mounted, and denies with the one pattern the rest of the console already uses.
    <PermissionGate permission="billing.view_commission_details" area="Invoices">
      <AppShell>
        <div className="flex flex-col gap-lg">
          <div className="flex items-center justify-between">
            <h1 className="text-h1 text-text-primary">Invoices</h1>
            {canRecordPayment && <Button onClick={() => setShowForm(true)}>Create Invoice</Button>}
          </div>

          {showForm && <CreateInvoiceForm onClose={() => setShowForm(false)} />}
          {openInvoice && (
            <InvoiceDrawer
              invoice={openInvoice}
              canRecordPayment={canRecordPayment}
              onClose={() => setOpenInvoiceId(null)}
            />
          )}

          <Table
            columns={columns}
            rows={rows}
            rowKey={(inv) => inv.id}
            onRowClick={(inv) => setOpenInvoiceId(inv.id)}
            loading={invoices.isLoading}
            error={invoices.isError ? 'Could not load invoices.' : undefined}
            emptyMessage={
              search || status
                ? 'No invoices match your search or status filter.'
                : 'No invoices yet. Create one with the button above; the client sees it in the app.'
            }
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
              placeholder: 'Search number or applicant…',
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
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="void">Void</option>
              </CompactSelect>
            }
            pagination={{
              hasNext: Boolean(invoices.data?.meta.next_cursor),
              hasPrevious: paging.hasPrevious,
              onNext: () => invoices.data?.meta.next_cursor && paging.next(invoices.data.meta.next_cursor),
              onPrevious: paging.previous,
              total: invoices.data?.meta.total,
            }}
          />
        </div>
      </AppShell>
    </PermissionGate>
  )
}

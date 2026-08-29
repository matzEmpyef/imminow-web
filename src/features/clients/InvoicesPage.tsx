import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '@/features/auth/AppShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Table, type TableColumn } from '@/components/Table'
import { SearchSelect } from '@/components/SearchSelect'
import { Modal } from '@/components/Modal'
import { useClients } from '@/queries/clients'
import { useMyConsultancy } from '@/queries/consultancy'
import { useCreateInvoice, useInvoices, useVoidInvoice } from '@/queries/invoicing'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'

const STATUS_COLOR = { sent: 'info', paid: 'success', overdue: 'error', void: 'secondary' } as const

type Invoice = NonNullable<ReturnType<typeof useInvoices>['data']>['items'][number]

interface LineItem {
  description: string
  amount: string
}

// User-requested (2026-08-15) — "wherever there is add button, use popup, instead of inline
// form." Was an inline Card that expanded below the page header; now a Modal, same fields.
function CreateInvoiceForm({ onClose }: { onClose: () => void }) {
  const clients = useClients()
  const createInvoice = useCreateInvoice()
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
    const items = lineItems
      .filter((li) => li.description && li.amount)
      .map((li) => ({ description: li.description, amount: Number(li.amount) }))
    if (!journeyId || items.length === 0) return
    createInvoice.mutate({ journey_id: journeyId, line_items: items }, { onSuccess: onClose })
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
          <label className="text-body-sm font-medium text-text-primary" htmlFor="invoice-applicant">
            Applicant
          </label>
          <SearchSelect
            id="invoice-applicant"
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
  const voidInvoice = useVoidInvoice()
  const [showForm, setShowForm] = useState(false)
  const [voidingId, setVoidingId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')

  function resetPaging() {
    paging.reset()
  }

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
      render: (inv) => (
        <Link to={`/clients/${inv.journey_id}`} className="text-text-primary hover:text-primary hover:underline">
          {inv.applicant_name}
        </Link>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      align: 'right',
      render: (inv) => `${(inv.amount.amount ?? 0).toLocaleString()} ${inv.amount.currency}`,
    },
    { key: 'created_at', header: 'Created', sortable: true, render: (inv) => formatDate(inv.created_at) },
    { key: 'status', header: 'Status', render: (inv) => <Badge color={STATUS_COLOR[inv.status]}>{inv.status}</Badge> },
    {
      key: 'actions',
      header: '',
      render: (inv) =>
        inv.status !== 'void' && (
          <div className="flex items-center justify-end gap-xs">
            {voidingId === inv.id ? (
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
                  loading={voidInvoice.isPending}
                  onClick={() =>
                    voidInvoice.mutate(
                      { id: inv.id, reason: voidReason },
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
              <button onClick={() => setVoidingId(inv.id)} className="text-caption text-error hover:underline">
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
          <h1 className="text-h1 text-text-primary">Invoices</h1>
          <Button onClick={() => setShowForm(true)}>Create Invoice</Button>
        </div>

        {showForm && <CreateInvoiceForm onClose={() => setShowForm(false)} />}

        <Table
          columns={columns}
          rows={invoices.data?.items ?? []}
          rowKey={(inv) => inv.id}
          loading={invoices.isLoading}
          emptyMessage="No invoices yet."
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
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as typeof status)
                resetPaging()
              }}
              aria-label="Status"
              className="h-10 rounded-md border border-border bg-background px-3 text-body-sm capitalize"
            >
              <option value="">Any status</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="void">Void</option>
            </select>
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
  )
}

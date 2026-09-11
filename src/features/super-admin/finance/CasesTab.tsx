import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/Badge'
import { CompactSelect } from '@/components/CompactSelect'
import { Table, type TableColumn } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'
import { useCountries } from '@/queries/countries'
import { useFinanceCases, type FinanceCaseRow, type FinanceCasesFilters } from '@/queries/financeDashboard'
import { ConsultancySearchSelect } from './ConsultancySearchSelect'

function inr(n: number | undefined): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

const STATUS_COLOR = { unpaid: 'warning', part_paid: 'info', paid: 'success' } as const
const STATUS_LABEL = { unpaid: 'Unpaid', part_paid: 'Part-paid', paid: 'Paid' } as const

/**
 * Every active commission case, server-paged (2026-09-11 rebuild) — the platform expects hundreds
 * of these, so this replaces the old page's flat card list with search, filters and a totals line
 * scoped to whatever is currently filtered.
 */
export function CasesTab() {
  const countries = useCountries()
  const [search, setSearch] = useState('')
  const [consultancyId, setConsultancyId] = useState('')
  const [country, setCountry] = useState('')
  const [payerMethod, setPayerMethod] = useState<NonNullable<FinanceCasesFilters['payer_method']> | ''>('')
  const [paymentStatus, setPaymentStatus] = useState<NonNullable<FinanceCasesFilters['payment_status']> | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const paging = useCursorPagination()

  function resetPaging() {
    paging.reset()
  }

  const cases = useFinanceCases({
    search: search || undefined,
    consultancy_id: consultancyId || undefined,
    destination_country: country || undefined,
    payer_method: payerMethod || undefined,
    payment_status: paymentStatus || undefined,
    from: from || undefined,
    to: to || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : 'recognized_at',
    cursor: paging.cursor,
    limit: 20,
  })

  const columns: TableColumn<FinanceCaseRow>[] = [
    {
      key: 'applicant_name',
      header: 'Student',
      sortable: true,
      render: (r) =>
        r.journey_id ? (
          <Link to={`/admin/case-followups/${r.journey_id}`} className="font-medium text-primary hover:underline">
            {r.applicant_name}
          </Link>
        ) : (
          <span className="font-medium text-text-primary">{r.applicant_name}</span>
        ),
    },
    { key: 'consultancy_name', header: 'Consultancy', render: (r) => r.consultancy_name },
    { key: 'destination_country', header: 'Country', hideBelow: 'md', render: (r) => r.destination_country ?? '—' },
    { key: 'college_name', header: 'College', hideBelow: 'lg', render: (r) => r.college_name ?? '—' },
    {
      key: 'rate_percent',
      header: 'Rate',
      align: 'right',
      hideBelow: 'sm',
      render: (r) => (
        <span className="flex items-center justify-end gap-xs">
          {r.rate_percent != null ? `${r.rate_percent}%` : '—'}
          {r.rate_source === 'fallback_default' && <Badge color="warning">default rate</Badge>}
        </span>
      ),
    },
    { key: 'due_inr', header: 'Due', align: 'right', render: (r) => <span className="tabular-nums">{inr(r.due_inr)}</span> },
    { key: 'paid_inr', header: 'Paid', align: 'right', render: (r) => <span className="tabular-nums">{inr(r.paid_inr)}</span> },
    {
      key: 'outstanding_inr',
      header: 'Outstanding',
      sortable: true,
      align: 'right',
      render: (r) => <span className="tabular-nums font-medium text-text-primary">{inr(r.outstanding_inr)}</span>,
    },
    {
      key: 'payment_status',
      header: 'Status',
      render: (r) => <Badge color={STATUS_COLOR[r.payment_status]}>{STATUS_LABEL[r.payment_status]}</Badge>,
    },
    {
      key: 'recognized_at',
      header: 'Accepted',
      sortable: true,
      align: 'right',
      render: (r) => formatDate(r.recognized_at),
    },
  ]

  const totals = cases.data?.totals
  const anyFilter = Boolean(search || consultancyId || country || payerMethod || paymentStatus || from || to)

  return (
    <div className="flex flex-col gap-md">
      {totals && (
        <p className="text-body-sm text-text-secondary">
          Due {inr(totals.due_inr)} · Paid {inr(totals.paid_inr)} · Outstanding {inr(totals.outstanding_inr)} for these filters
        </p>
      )}
      <Table
        columns={columns}
        rows={cases.data?.items ?? []}
        rowKey={(r) => r.id}
        loading={cases.isLoading}
        error={cases.isError ? 'Could not load commission cases.' : undefined}
        emptyMessage={anyFilter ? 'No cases match these filters.' : 'No active commission cases yet.'}
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
          placeholder: 'Search student, consultancy or college…',
        }}
        filters={
          <>
            <ConsultancySearchSelect
              value={consultancyId}
              onChange={(id) => {
                setConsultancyId(id)
                resetPaging()
              }}
            />
            <CompactSelect
              value={country}
              onChange={(e) => {
                setCountry(e.target.value)
                resetPaging()
              }}
              label="Country"
            >
              <option value="">Any country</option>
              {countries.data?.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </CompactSelect>
            <CompactSelect
              value={payerMethod}
              onChange={(e) => {
                setPayerMethod(e.target.value as NonNullable<FinanceCasesFilters['payer_method']> | '')
                resetPaging()
              }}
              label="Payer method"
            >
              <option value="">Any payer</option>
              <option value="college">College</option>
              <option value="applicant">Applicant</option>
              <option value="split">Split</option>
            </CompactSelect>
            <CompactSelect
              value={paymentStatus}
              onChange={(e) => {
                setPaymentStatus(e.target.value as NonNullable<FinanceCasesFilters['payment_status']> | '')
                resetPaging()
              }}
              label="Payment status"
            >
              <option value="">Any status</option>
              <option value="unpaid">Unpaid</option>
              <option value="part_paid">Part-paid</option>
              <option value="paid">Paid</option>
            </CompactSelect>
            <input
              type="date"
              aria-label="Accepted from"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                resetPaging()
              }}
              className="h-10 rounded-md border border-border bg-background px-3 text-body-sm text-text-primary outline-none focus:border-primary"
            />
            <input
              type="date"
              aria-label="Accepted to"
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
          hasNext: Boolean(cases.data?.meta.next_cursor),
          hasPrevious: paging.hasPrevious,
          onNext: () => cases.data?.meta.next_cursor && paging.next(cases.data.meta.next_cursor),
          onPrevious: paging.previous,
          total: cases.data?.meta.total,
        }}
      />
    </div>
  )
}

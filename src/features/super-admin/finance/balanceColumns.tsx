import { type TableColumn } from '@/components/Table'
import { type ConsultancyBalanceRow } from '@/queries/financeDashboard'
import { inr } from '@/lib/money'

const num = (cls = '') => `tabular-nums ${cls}`.trim()

/**
 * The balance table's columns. The four extra money columns (Waived, Credit, Exchange difference,
 * Written off) are the parts that make each row add up to its Due, served per row; one that is zero
 * on every row of the page is left out so the table does not carry a column of ₹0.00.
 */
export function balanceColumns(rows: ConsultancyBalanceRow[]): TableColumn<ConsultancyBalanceRow>[] {
  const extra = (
    key: 'written_off_inr' | 'credit_inr' | 'waived_inr' | 'exchange_difference_inr',
    header: string,
  ): TableColumn<ConsultancyBalanceRow>[] =>
    rows.some((r) => (r[key] ?? 0) !== 0)
      ? [{ key, header, align: 'right', render: (r) => <span className={num('text-text-secondary')}>{inr(r[key])}</span> }]
      : []

  return [
    { key: 'consultancy_name', header: 'Consultancy', sortable: true, render: (r) => r.consultancy_name },
    { key: 'cases', header: 'Cases', sortable: true, align: 'right', render: (r) => <span className={num()}>{r.cases}</span> },
    { key: 'due_inr', header: 'Due', sortable: true, align: 'right', render: (r) => <span className={num()}>{inr(r.due_inr)}</span> },
    ...extra('written_off_inr', 'Written off'),
    { key: 'paid_inr', header: 'Paid', sortable: true, align: 'right', render: (r) => <span className={num()}>{inr(r.paid_inr)}</span> },
    ...extra('credit_inr', 'Credit'),
    ...extra('waived_inr', 'Waived'),
    {
      key: 'awaiting_inr',
      header: 'Awaiting',
      sortable: true,
      align: 'right',
      render: (r) => <span className={num()}>{inr(r.awaiting_inr)}</span>,
    },
    {
      key: 'outstanding_inr',
      header: 'Outstanding',
      sortable: true,
      align: 'right',
      render: (r) => <span className={num('font-medium text-text-primary')}>{inr(r.outstanding_inr)}</span>,
    },
    ...extra('exchange_difference_inr', 'Exchange difference'),
    {
      key: 'oldest_unpaid_days',
      header: 'Oldest unpaid',
      sortable: true,
      align: 'right',
      hideBelow: 'md',
      render: (r) => <span className={num('text-text-secondary')}>{r.oldest_unpaid_days != null ? `${r.oldest_unpaid_days} days` : '—'}</span>,
    },
  ]
}

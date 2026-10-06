import type { CsvColumn } from '@/lib/csv'
import { formatDate } from '@/lib/time'
import type { CommissionPayment } from '@/queries/commission'
import { paymentAmount, paymentInrAmount } from './money'

function settledAt(p: CommissionPayment): string | null | undefined {
  return p.status === 'confirmed' ? p.confirmed_at : p.status === 'rejected' ? p.rejected_at : null
}

/**
 * The columns of the payment history export (review F-158). Finance reconciles from this file.
 *
 * Money is three columns, the same three facts the screen shows for a payment: the currency it
 * was paid in, the amount in that currency (from the stored minor units, so CAD 1,240.60 is
 * 1240.6 and not a rounded 1241), and its value in rupees. The export used to have one column,
 * titled "Amount INR", holding each payment's own-currency amount: a CAD 1,240.60 payment read
 * as 1240.6 rupees.
 *
 * The amounts are numbers, not text, so a spreadsheet can add them up.
 */
export const PAYMENT_HISTORY_COLUMNS: CsvColumn<CommissionPayment>[] = [
  { header: 'Date', value: (p) => formatDate(settledAt(p) ?? p.recorded_at) },
  { header: 'Status', value: (p) => p.status },
  { header: 'Currency', value: (p) => p.amount.currency ?? 'INR' },
  { header: 'Amount', value: (p) => paymentAmount(p) },
  { header: 'Amount INR', value: (p) => paymentInrAmount(p) },
  { header: 'Consultancy', value: (p) => p.consultancy_name ?? 'Unknown' },
  { header: 'Student', value: (p) => p.applicant_name ?? 'General' },
  { header: 'Reference', value: (p) => p.transaction_id },
  { header: 'Declared', value: (p) => formatDate(p.recorded_at) },
  { header: 'Confirmed/Rejected', value: (p) => (settledAt(p) ? formatDate(settledAt(p)!) : '') },
  {
    header: 'By',
    value: (p) => (p.status === 'confirmed' ? p.confirmed_by_name : p.status === 'rejected' ? p.rejected_by_name : null),
  },
  { header: 'Reason', value: (p) => p.reject_reason },
]

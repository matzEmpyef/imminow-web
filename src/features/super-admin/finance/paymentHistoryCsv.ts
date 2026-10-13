import type { CsvColumn } from '@/lib/csv'
import type { CommissionPayment, PaymentExport } from '@/queries/commission'

/** One cell of the row's export line, exactly as the server wrote it; an empty cell if the row has none. */
function cell(key: keyof PaymentExport): (p: CommissionPayment) => string {
  return (p) => p.export?.[key] ?? ''
}

/**
 * The columns of the payment history export (review F-158). Finance reconciles from this file.
 *
 * Phase 8 T4-04 to T4-06: every cell is a finished string from the server (`CommissionPayment.export`)
 * — money with two decimals and no grouping ("537.50"), dates as DD-MM-YYYY on India's calendar,
 * an empty string where there is nothing to say. The console writes each cell as it comes and
 * formats, rounds and converts nothing; it used to build the amounts and dates itself, which is how
 * the file and the screen could disagree.
 *
 * The headers and their order are unchanged, so a saved sheet that reads the columns by position
 * still works. The last three are for money that arrived in another currency than the one owed:
 * "Settled in" (the currency of the dues it settled), "Rate used" and "Amount settled".
 */
export const PAYMENT_HISTORY_COLUMNS: CsvColumn<CommissionPayment>[] = [
  { header: 'Date', value: cell('date') },
  { header: 'Status', value: cell('status') },
  { header: 'Currency', value: cell('currency') },
  { header: 'Amount', value: cell('amount') },
  { header: 'Amount INR', value: cell('amount_inr') },
  { header: 'Consultancy', value: cell('account') },
  { header: 'Student', value: cell('applicant') },
  { header: 'Reference', value: cell('reference') },
  { header: 'Declared', value: cell('declared_on') },
  { header: 'Confirmed/Rejected', value: cell('decided_on') },
  { header: 'By', value: cell('decided_by') },
  { header: 'Reason', value: cell('reason') },
  { header: 'Settled in', value: cell('settled_in') },
  { header: 'Rate used', value: cell('rate_used') },
  { header: 'Amount settled', value: cell('amount_settled') },
]

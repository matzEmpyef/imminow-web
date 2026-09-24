import { formatDate } from '@/lib/time'
import type { components } from '@/api/schema'

type CommissionDuePart = components['schemas']['CommissionDuePart']

interface MoneyLike {
  amount?: number | null
  currency?: string | null
}

/**
 * How a due part's own money is written — each side keeps its own format: Finance (Super Admin)
 * writes INR as "₹1,23,456" (finance/money.ts), the consultancy's Commission Details writes
 * "INR 1,23,456" (lib/money.ts formatMoneyAmount).
 */
export type DuePartMoneyFormatter = (money: MoneyLike | null | undefined) => string

// A rate nobody has set is not 0 % (assumptions audit, approved 2026-09-19) — "Tuition — 0 % of
// CAD 32,000" read to a consultancy as an agreement priced at nothing, when the truth is that the
// rate is still missing. Same money area as C5, so it goes in with it.
function rateShare(ratePercent: number | null | undefined): string {
  return ratePercent == null ? 'rate not set' : `${ratePercent}% share`
}

/**
 * One line naming what a due part is for. Shared by Finance's case drawer and the consultancy's
 * Due Schedule drawer (Phase 5 cleanup, 2026-09-24) — the two copies had drifted, and the Finance one still
 * read an unset rate as "0% share".
 */
export function duePartLabel(
  part: CommissionDuePart,
  ratePercent: number | null | undefined,
  tuitionFee: MoneyLike | null | undefined,
  money: DuePartMoneyFormatter,
): string {
  if (part.kind === 'override') return `Override — ${part.reason ?? 'no reason given'}`
  if (part.kind === 'added') return `Added — ${part.reason ?? 'no reason given'}`
  switch (part.source) {
    case 'student':
      return `Student's fee — ${rateShare(ratePercent)}`
    case 'student_instalment':
      return `Student payment of ${money(part.instalment_amount)} received ${
        part.instalment_received_on ? formatDate(part.instalment_received_on) : '—'
      }`
    case 'student_expected':
      return 'Student money not received yet'
    case 'college_instalment':
      return `College instalment of ${money(part.instalment_amount)} received ${
        part.instalment_received_on ? formatDate(part.instalment_received_on) : '—'
      }`
    case 'college_expected':
      return 'College money not received yet'
    case 'tuition':
      return tuitionFee?.amount != null
        ? `Tuition — ${rateShare(ratePercent)} of ${money({ amount: tuitionFee.amount, currency: tuitionFee.currency ?? 'INR' })}`
        : `Tuition — ${rateShare(ratePercent)}`
    default:
      return 'Due'
  }
}

/** When a due part is owed — a date once one is set, otherwise the event it waits on. */
export function duePartDueDateText(part: CommissionDuePart): string {
  if (part.due_on) return formatDate(part.due_on)
  if (part.source === 'college_expected' || part.source === 'college_instalment') return 'When the college pays'
  if (part.source === 'student_expected' || part.source === 'student_instalment') return 'When the student pays'
  return 'When the case closes'
}

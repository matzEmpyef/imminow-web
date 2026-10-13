import { formatMoney } from '@/lib/money'
import type { FreelancerReferral } from '@/queries/freelancerReferrals'

export const PAYOUT_LABEL: Record<'not_due' | 'owed' | 'paid', string> = { not_due: 'Not due yet', owed: 'Owed', paid: 'Paid' }

/**
 * The payout badge's words for one referral. A closed or moved case that earned nothing will never
 * become due, so "Not due yet" (which promises money may follow) reads "Nothing due" there (T4-36).
 */
export function payoutLabel(r: Pick<FreelancerReferral, 'payout_status' | 'stage' | 'earned_inr'>): string {
  const status = r.payout_status ?? 'not_due'
  if (status === 'not_due' && (r.stage === 'closed' || r.stage === 'moved') && (r.earned_inr ?? 0) === 0) {
    return 'Nothing due'
  }
  return PAYOUT_LABEL[status]
}

/** What the panel says under "Payments to you" when there are none yet, by what is true of the referral. */
export function noPaymentsLine(r: Pick<FreelancerReferral, 'stage' | 'earned_inr' | 'owed_inr'>): string {
  if ((r.owed_inr ?? 0) > 0) {
    return `immiNow owes you ${formatMoney('INR', r.owed_inr ?? 0)} for this student. The payment will appear here once it is made.`
  }
  if ((r.stage === 'closed' || r.stage === 'moved') && (r.earned_inr ?? 0) === 0) {
    return 'Nothing will be paid for this student, because the case is closed with no earnings.'
  }
  return 'No payments yet. You are paid after immiNow receives its commission for this student.'
}


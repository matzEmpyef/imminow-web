/**
 * Shared copy for both follow-up queues (2026-09-11): outcome option lists for LogCallModal, the
 * badge label for a saved outcome, and signal labels for the Signal filter.
 *
 * Signal labels are hardcoded here (mirroring CASE_SIGNALS / SERVICE_SIGNALS in mock-server's
 * server.js) rather than read off a loaded row, because `FollowupSummary.by_signal` is computed
 * over EVERY row including snoozed ones the queue currently has hidden — a code that only exists
 * on a snoozed row would have a count but no visible row to read a label off.
 */

export interface FollowupOutcomeOption {
  value: string
  label: string
}

export const CASE_OUTCOME_OPTIONS: FollowupOutcomeOption[] = [
  { value: 'promised_to_close', label: 'Promised to close' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'resolved', label: 'Resolved' },
]

export const SERVICE_OUTCOME_OPTIONS: FollowupOutcomeOption[] = [
  { value: 'helped', label: 'Helped' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'resolved', label: 'Resolved' },
]

export const OUTCOME_LABELS: Record<string, string> = Object.fromEntries(
  [...CASE_OUTCOME_OPTIONS, ...SERVICE_OUTCOME_OPTIONS].map((o) => [o.value, o.label]),
)

export const CASE_SIGNAL_LABELS: Record<string, string> = {
  closed_without_acceptance: 'Closed with no accepted college',
  accepted_not_closed: 'Accepted, still open',
  failed_despite_acceptance: 'Closed as a failure despite an acceptance',
  payment_overdue: 'Payment overdue',
}

export const SERVICE_SIGNAL_LABELS: Record<string, string> = {
  no_consultancy_yet: 'Intake set, no consultancy yet',
  waiting_for_allocation: 'Waiting for a consultancy',
  lead_no_reply: 'No reply from the consultancy',
  waiting_for_plan: 'Waiting for a plan',
  stalled_application: 'Applied, no movement',
  plan_steps_overdue: 'Plan steps overdue',
  long_running: 'Running over six months',
}

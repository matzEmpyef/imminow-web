/**
 * Shared copy for the Complaints and Disputes pages (2026-09-11 rebuild): category/status labels,
 * the working-note outcome list both `/complaints/{id}/notes` and `/disputes/{id}/notes` share
 * (same `SupportCaseNote.outcome` enum on both), and how a dispute's resolution reads back.
 */

export const CATEGORY_LABELS: Record<string, string> = {
  consultancy_dispute: 'Consultancy dispute',
  payment_issue: 'Payment issue',
  app_problem: 'App problem',
  other: 'Other',
}

export const COMPLAINT_STATUS_META: Record<string, { label: string; color: 'warning' | 'info' | 'success' }> = {
  open: { label: 'Open', color: 'warning' },
  in_review: { label: 'In review', color: 'info' },
  resolved: { label: 'Resolved', color: 'success' },
}

export interface NoteOutcomeOption {
  value: string
  label: string
}

export const NOTE_OUTCOME_OPTIONS: NoteOutcomeOption[] = [
  { value: 'spoke_to_student', label: 'Spoke to student' },
  { value: 'spoke_to_consultancy', label: 'Spoke to consultancy' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'waiting_on_student', label: 'Waiting on student' },
  { value: 'waiting_on_consultancy', label: 'Waiting on consultancy' },
]

export const NOTE_OUTCOME_LABELS: Record<string, string> = Object.fromEntries(
  NOTE_OUTCOME_OPTIONS.map((o) => [o.value, o.label]),
)

export const RESOLUTION_ACTION_LABELS: Record<string, string> = {
  resume: 'Resumed the case',
  close: 'Closed the case',
  reassign: 'Moved the student',
}

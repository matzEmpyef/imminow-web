/**
 * One label per case status, for everywhere the console prints one (2026-09-14). Until now four
 * screens each kept their own map or fell back to `status.replace(/_/g, ' ')`, so the same
 * completed case read "Completed" in one modal, "Closed" on the Overview tab and "closed
 * completed" in the profile header. `closed_completed` is a success close — the student's
 * Stage 3 (post-arrival) journey in the Sentpo app — and reads as such here.
 */
export const CLIENT_STATUS_LABELS: Record<string, string> = {
  pending_plan_assignment: 'Pending plan assignment',
  in_plan: 'In plan',
  plan_complete: 'Plan complete',
  in_dispute: 'In dispute',
  closed: 'Closed',
  closed_switched: 'Switched to another consultancy',
  closed_completed: 'Completed — post-arrival',
}

export type ClientStatusColor = 'warning' | 'info' | 'success' | 'secondary'

export const CLIENT_STATUS_COLORS: Record<string, ClientStatusColor> = {
  pending_plan_assignment: 'warning',
  in_plan: 'info',
  plan_complete: 'success',
  in_dispute: 'warning',
  closed: 'secondary',
  closed_switched: 'secondary',
  closed_completed: 'success',
}

/** A readable label for any status, including one this file has not heard of yet. */
export function clientStatusLabel(status: string | null | undefined): string {
  if (!status) return ''
  return CLIENT_STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}

export function clientStatusColor(status: string | null | undefined): ClientStatusColor {
  return (status && CLIENT_STATUS_COLORS[status]) || 'secondary'
}

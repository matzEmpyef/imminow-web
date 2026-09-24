import { formatDate } from '@/lib/time'

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

/**
 * Case-moved read-only state (product owner 2026-09-24). A case whose consultancy-side status is
 * `closed_switched` moved to another consultancy — by that consultancy's own Transfer, a support
 * switch, or a dispute move — and every consultancy-side WRITE on it now 409s `case_moved` here,
 * except internal notes. Reads stay open. This is one place to ask "is this case ours to touch
 * any more?" so the profile page, the tabs and the clients list all draw the same line.
 */
export function isCaseMoved(status: string | null | undefined): boolean {
  return status === 'closed_switched'
}

/** Shape every screen has to hand — whatever the Client record actually carries. */
interface MovedCaseFields {
  status?: string | null
  closed_at?: string | null
}

/**
 * The read-only banner's sentence. The Client schema carries no `transferred_to`/`transferred_at`
 * (checked 2026-09-24 — only `closed_at` and `status` say anything about how a case ended), so the
 * destination always reads as "another consultancy" today; this stays ready to name it the day the
 * API adds one, without another banner rewrite.
 */
export function caseMovedBannerMessage(client: MovedCaseFields): string | null {
  if (!isCaseMoved(client.status)) return null
  const date = client.closed_at ? formatDate(client.closed_at) : null
  return `This case moved to another consultancy${date ? ` on ${date}` : ''} — you can read its history, but it's read-only now.`
}

/** Tooltip/helper text for a disabled action on a moved case — the server's own wording, generic name. */
export const CASE_MOVED_ACTION_REASON = "This case has moved to another consultancy — it's read-only now."

/** What replaces the chat composer on a moved case (ChatPanel's `composerLocked`, same idiom Lead Pool's unallocated lock uses). */
export const CASE_MOVED_COMPOSER_NOTE = "This case has moved to another consultancy — you can read the history, but nothing more can be sent."

/** Transfer's own 409 when the case has an accepted college (or, for a PR case, a recorded contribution) — mirrored here so Transfer can be disabled before the click, not just after the 409. */
export const CASE_HAS_ACCEPTED_COLLEGE_REASON =
  "This case has an accepted college, so it can't be transferred. Close the case or raise a dispute instead."

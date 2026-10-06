import { useFeature } from '@/lib/features'
import { isCaseMoved, isClosedByAccountDeletion } from '@/lib/clientStatus'

/**
 * Whether the console offers Reopen on a closed lead or a closed case. ONE set of rules for every
 * place the control appears (both lists and both detail pages), so they cannot disagree again:
 * the detail pages checked the plan, the lists checked nothing, and a Starter account was offered
 * a control on every closed row that ended in a raw refusal (review F-147).
 *
 * What the server checks, and so what is checked here:
 *
 *   - the `case_reopening` plan feature (Business and up), for a lead and for a case;
 *   - no permission key: reopening a lead or a case needs none beyond the feature (owner Q3,
 *     2026-09-25; the contract's own words on `POST /leads/{id}/reopen`). Reopen PLAN is a
 *     different action and keeps its own `step_review.reopen_plan` permission.
 */
export const REOPEN_FEATURE = 'case_reopening'

/** The plan side of the rule: does this consultancy's plan include reopening at all? */
export function useCanReopen(): boolean {
  return useFeature(REOPEN_FEATURE)
}

interface LeadForReopen {
  status?: string | null
}

/**
 * True when a closed lead may never be reopened by the consultancy (owner ruling, 2026-10-06): it
 * closed because the student chose another consultancy, or the student closed it themselves. Only
 * the student restarts such a lead, by starting a new chat; the server refuses the reopen.
 *
 * THE CONTRACT DOES NOT SAY WHICH LEADS THESE ARE YET. `Lead` carries `status` and nothing about
 * who closed it or why (no closed-by, no close reason), so the console cannot tell such a lead
 * from one the consultancy closed itself, and this answers false for every lead. Until the server
 * sends that fact, the control is still shown on these leads and pressing it ends in the server's
 * refusal, which the Reopen dialog shows in the server's own words.
 *
 * This function is the one place to read the field when it exists. Needed on `Lead` (staff view):
 * either a server-decided `can_reopen: boolean`, or `closed_by` (`consultancy` | `student` |
 * `system`) with a `close_reason_code` that names "chose another consultancy".
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the lead is what the rule will read
export function leadClosedOnStudentSide(_lead: LeadForReopen): boolean {
  return false
}

/** Reopen is offered on a lead: it is closed, the plan includes reopening, and it is ours to reopen. */
export function canOfferLeadReopen(lead: LeadForReopen, planIncludesReopening: boolean): boolean {
  return planIncludesReopening && lead.status === 'closed' && !leadClosedOnStudentSide(lead)
}

interface CaseForReopen {
  status?: string | null
  close_sub_reason?: string | null
}

/**
 * Reopen Case is offered: the case is closed (not moved to another consultancy, which is not ours
 * to reopen), the plan includes reopening, and it did not close because the student deleted their
 * account (owner ruling, 2026-10-06: "Reopen Case" is hidden on such a case; the server answers
 * 409 `closed_by_platform`).
 */
export function canOfferCaseReopen(client: CaseForReopen, planIncludesReopening: boolean): boolean {
  if (!planIncludesReopening || client.status !== 'closed') return false
  return !isCaseMoved(client.status) && !isClosedByAccountDeletion(client)
}

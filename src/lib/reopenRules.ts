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
 *
 * A LEAD is no longer worked out here at all: the server decides and says so on the lead
 * (`Lead.can_reopen`, owner ruling "Lead reopen", 2026-10-06). A CASE still is, from its status,
 * its close reason and the plan.
 */
export const REOPEN_FEATURE = 'case_reopening'

/** The plan side of the rule: does this consultancy's plan include reopening at all? */
export function useCanReopen(): boolean {
  return useFeature(REOPEN_FEATURE)
}

interface LeadForReopen {
  can_reopen?: boolean | null
}

/**
 * Reopen is offered on a lead exactly when the server says it may be reopened now. This is the
 * ONE place the console reads `Lead.can_reopen`.
 *
 * The server's answer already covers everything the console used to piece together, and the one
 * thing it never could: the lead is closed, the plan includes reopening, and the consultancy
 * closed it itself. A lead that closed because the student chose another consultancy, closed it
 * themselves or deleted their account can never be reopened by the consultancy (only the student
 * restarts it, by starting a new chat), and before this field the control was still shown on
 * those and ended in the server's refusal.
 *
 * Fails closed: a lead that does not carry the field is not offered Reopen. Pressing Reopen can
 * still be refused for a reason of the moment (the student has a live case, or too many open
 * chats); the Reopen dialog shows that in the server's own words.
 */
export function canOfferLeadReopen(lead: LeadForReopen): boolean {
  return lead.can_reopen === true
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

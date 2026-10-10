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

interface PlanForReopen {
  steps?: ReadonlyArray<{
    id?: string
    status?: string | null
    title?: string | null
    position?: number | null
  }> | null
}

/**
 * Reopen Plan is offered when the server will accept it (review 2.114). The route reopens the
 * NEWEST plan's last `done` step, and refuses with 409 `conflict` when the plan has no completed
 * step. A step already in progress does NOT stop it (owner's ruling 2026-10-10): the plan still has
 * one active step, so the running one goes back to waiting, its work kept, and opens again when the
 * reopened step is completed (`planReopenImpact` names both). That is readable from the plan's own
 * steps, so the console checks it instead of waiting for a case status the server never stores
 * (`plan_complete` is legacy).
 *
 * `plans` is `GET /clients/{id}/plans`, oldest first, so the newest plan is the last. The case
 * must be one this consultancy can still act on: not moved away, not under mediation, not closed.
 * The contract is silent on closed cases; the page offers Reopen Case there instead.
 *
 * Pressing it can still be refused for a reason of the moment; the server's sentence is shown.
 */
export function canOfferPlanReopen(
  client: CaseForReopen,
  plans: ReadonlyArray<PlanForReopen> | null | undefined,
  allowed: boolean,
): boolean {
  if (!allowed) return false
  if (client.status === 'closed' || client.status === 'in_dispute' || isCaseMoved(client.status)) return false
  const newest = plans?.[plans.length - 1]
  const steps = newest?.steps ?? []
  return steps.some((s) => s.status === 'done')
}

/**
 * What pressing Reopen Plan will do, by step name, so the dialog can say so before it is
 * confirmed (owner's ruling 2026-10-10: one rule everywhere, no picker). Only the most recently
 * completed step is ever reopened: the step just before the one in progress, or the plan's last
 * `done` step when nothing is in progress. The step in progress, if there is one, goes back to
 * waiting with its work kept. `stepId` names the step to the server so it does not have to guess.
 * `reopened` is null when that step is not completed (the server then says so with its own 409).
 */
export function planReopenImpact(plans: ReadonlyArray<PlanForReopen> | null | undefined): {
  reopened: { id?: string; title: string } | null
  inProgress: string | null
} | null {
  const steps = [...(plans?.[plans.length - 1]?.steps ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  if (!steps.some((s) => s.status === 'done')) return null
  const runningAt = steps.findIndex((s) => s.status === 'active')
  const target = runningAt >= 0 ? steps[runningAt - 1] : steps.filter((s) => s.status === 'done').at(-1)
  const reopened = target?.status === 'done' ? { id: target.id, title: target.title || 'the completed step' } : null
  const running = runningAt >= 0 ? steps[runningAt] : null
  return { reopened, inProgress: running ? running.title || 'The current step' : null }
}

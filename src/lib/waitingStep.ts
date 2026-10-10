/**
 * A step that was in progress and went back to waiting because the step before it was reopened
 * (Reopen Plan, owner's ruling 2026-10-10). The server still calls it `locked` (pending): it has
 * not been completed and it is not the step in progress. Its answers and uploads are kept, and it
 * continues, by the ordinary sequence, when the reopened step is completed again.
 *
 * Until then the server refuses to remove it, move it or change its title or tasks (409), so the
 * console does not offer those and says why in the server's own words.
 */
export interface StepWaiting {
  waiting_to_continue?: boolean
  waiting_for_step_title?: string | null
}

export const isWaitingStep = (step: StepWaiting): boolean => step.waiting_to_continue === true

/** The quiet line under a waiting step: which step has to be completed again first. */
export function waitingStepNote(step: StepWaiting): string {
  const title = step.waiting_for_step_title?.trim()
  return `Continues after ${title || 'the step before it'} is completed again`
}

/** The server's reason for the controls that are switched off on a waiting step (tooltip). */
export const WAITING_STEP_CANT_CHANGE =
  "This step was already started and is waiting for an earlier step to be completed again. It can't be removed, moved or have its tasks changed."

/**
 * The words for a plan step's state, in one place (T4-16, owner's ruling 110): a step is pending,
 * active, awaiting review (the student has submitted it) or completed. The server's own codes
 * (`locked`, `active`, `done`) are never shown. The Sentpo app says "In progress", "Submitted —
 * awaiting review" and "Completed" for the same states; the console keeps to the ruled short words.
 */
interface StepState {
  status: string
  submitted_at?: string | null
}

export function stepStateLabel(step: StepState): string {
  if (step.status === 'active' && step.submitted_at) return 'Awaiting review'
  switch (step.status) {
    case 'locked':
      return 'Pending'
    case 'active':
      return 'Active'
    case 'done':
      return 'Completed'
    default:
      return step.status
  }
}

export function stepStateColor(step: StepState): 'secondary' | 'info' | 'success' | 'warning' {
  if (step.status === 'active' && step.submitted_at) return 'warning'
  if (step.status === 'done') return 'success'
  if (step.status === 'active') return 'info'
  return 'secondary'
}

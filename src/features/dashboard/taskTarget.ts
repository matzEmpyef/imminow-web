import type { components } from '@/api/schema'

// A task on a lead carries the lead's id (`ActivityTask.lead_id`, T4-21) so the row opens the lead.
// Null for a client's task and for a task that belongs to neither. The generated type does not carry
// it yet (replace with generated type after the contract join).
export type ActivityTask = components['schemas']['ActivityTask'] & { lead_id?: string | null }

/** The lead's page for a task that belongs to a lead, else null. */
export function taskLeadTarget(task: components['schemas']['ActivityTask']): string | null {
  // replace with generated type after the contract join
  const leadId = (task as ActivityTask).lead_id
  return leadId ? `/sales/leads/${leadId}` : null
}

/** Where a task's row leads: its client, else its lead, else nowhere. */
export function taskTarget(task: components['schemas']['ActivityTask']): string | null {
  if (task.journey_id) return `/clients/${task.journey_id}`
  return taskLeadTarget(task)
}


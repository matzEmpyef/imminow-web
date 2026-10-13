import type { components } from '@/api/schema'

// A task on a lead carries the lead's id so the row can open the lead (T4-21). The feed does not
// serve it yet; until it does, a lead's task simply has nowhere to link to.
export type ActivityTask = components['schemas']['ActivityTask'] & { lead_id?: string | null }

/** Where a task's row leads: its client, else its lead, else nowhere. */
export function taskTarget(task: ActivityTask): string | null {
  if (task.journey_id) return `/clients/${task.journey_id}`
  if (task.lead_id) return `/sales/leads/${task.lead_id}`
  return null
}


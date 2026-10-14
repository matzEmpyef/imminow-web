import type { components } from '@/api/schema'

type ActivityTask = components['schemas']['ActivityTask']

/** The lead's page for a task that belongs to a lead (`ActivityTask.lead_id`, T4-21), else null. */
export function taskLeadTarget(task: ActivityTask): string | null {
  return task.lead_id ? `/sales/leads/${task.lead_id}` : null
}

/** Where a task's row leads: its client, else its lead, else nowhere. */
export function taskTarget(task: ActivityTask): string | null {
  if (task.journey_id) return `/clients/${task.journey_id}`
  return taskLeadTarget(task)
}

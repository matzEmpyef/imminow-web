import type { components } from '@/api/schema'

// Owner's ruling 2026-10-09: the platform must not assign a student under 18 until their guardian
// has approved. The server works the state out (`guardian_status`) and says whether the row can
// be allocated (`awaiting_guardian_approval`); this is only the words for it.
type GuardianStatus = components['schemas']['ApplicantAllocationEntry']['guardian_status']

const WAITING: Record<Exclude<GuardianStatus, 'not_required' | 'approved'>, string> = {
  pending: 'Waiting for guardian approval',
  declined: 'Guardian declined — waiting for a new approval',
  withdrawn: 'Guardian took their approval back — waiting for a new approval',
  expired: 'Guardian’s approval link expired — waiting for a new approval',
}

/**
 * The tag for a row the guardian gate is holding, or null when it can be allocated. Judged on the
 * server's flag, so a status the console does not know yet still reads "Waiting for guardian
 * approval" rather than opening the gate.
 */
export function guardianHoldLabel(
  entry: { awaiting_guardian_approval?: boolean; guardian_status?: GuardianStatus } | null | undefined,
): string | null {
  if (!entry?.awaiting_guardian_approval) return null
  const status = entry.guardian_status
  return (status && status in WAITING ? WAITING[status as keyof typeof WAITING] : null) ?? WAITING.pending
}

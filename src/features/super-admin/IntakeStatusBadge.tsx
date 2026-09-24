import { Badge } from '@/components/Badge'
import type { components } from '@/api/schema'
import { intakeStatusLabel } from './courseFormShared'

type IntakeDeadline = components['schemas']['IntakeDeadline']

/**
 * An intake's state as the server derived it from the deadline — read-only everywhere since the
 * product owner's 2026-09-24 decision that nobody sets it (see `intakeStatusLabel`). Shared by
 * Course Setup's deadline table and Course Detail's Intake & Deadlines table so both word it the
 * same. Only an open intake gets a coloured pill; "no deadline" is an absence of data, not a
 * state worth drawing the eye to.
 */
export function IntakeStatusBadge({
  status,
  deadline,
}: {
  status: IntakeDeadline['status'] | null | undefined
  deadline: string | null | undefined
}) {
  const label = intakeStatusLabel(status, deadline)
  if (!label) return <span className="text-text-secondary">—</span>
  if (status === 'open') return <Badge color="success">{label}</Badge>
  if (status === 'closed') return <Badge color="secondary">{label}</Badge>
  return <span className="text-caption text-text-secondary">{label}</span>
}

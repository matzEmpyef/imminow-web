import { Badge } from '@/components/Badge'
import type { components } from '@/api/schema'

type Event = components['schemas']['Event']
type Status = NonNullable<Event['status']>

// One status for every event page (Marketing review, 2026-09-11) — replaces the old client-side
// upcoming/ongoing/completed computed from startsAt/endsAt, which the Quiz page never even used
// (it showed the raw `active` flag instead, so a quiz read "Active" weeks after it closed). The
// server now computes ONE `status` for every event type and every client shows it rather than
// re-deriving it: draft = a quiz whose pool is smaller than questions_per_attempt, voided = a
// cancelled quiz, upcoming/live/ended = the same window logic every page used to hand-roll.
const STATUS: Record<Status, { color: 'info' | 'success' | 'secondary' | 'error' | 'warning'; label: string }> = {
  upcoming: { color: 'info', label: 'Upcoming' },
  live: { color: 'success', label: 'Live' },
  ended: { color: 'secondary', label: 'Ended' },
  voided: { color: 'error', label: 'Voided' },
  draft: { color: 'warning', label: 'Draft' },
}

export function EventStatusBadge({ status }: { status?: Status | null }) {
  if (!status) return null
  const entry = STATUS[status]
  if (!entry) return null
  return <Badge color={entry.color}>{entry.label}</Badge>
}

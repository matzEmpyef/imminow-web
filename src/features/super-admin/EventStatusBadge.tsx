import { Badge } from '@/components/Badge'

// User-requested (2026-08-15) — "in the listview - we should be able to see status. upcoming,
// ongoing, completed." Computed live from starts_at/ends_at, never stored, so it can't go stale.
// Without an ends_at (not every event type requires one), "ongoing" just runs indefinitely once
// started — there's no "completed" state to compute without a window to close it.
export function EventStatusBadge({
  startsAt,
  endsAt,
}: {
  startsAt: string | null | undefined
  endsAt?: string | null
}) {
  if (!startsAt) return null
  const now = Date.now()
  const starts = new Date(startsAt).getTime()
  const ends = endsAt ? new Date(endsAt).getTime() : null

  if (now < starts) return <Badge color="info">Upcoming</Badge>
  if (ends !== null && now > ends) return <Badge color="secondary">Completed</Badge>
  return <Badge color="success">Ongoing</Badge>
}

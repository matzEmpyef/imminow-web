/// Time-zone handling for event authoring (Phase E, 2026-08-22).
///
/// Before this, an event's start time was `new Date(<datetime-local value>).toISOString()` —
/// which silently interprets what the admin typed in *the admin's own browser zone*. Nobody
/// stated that assumption and nothing downstream could recover it, so a Mumbai campus fair
/// entered by a colleague travelling in London was stored an hour or five and a half out.
///
/// The admin now names the zone the event happens in, and the wall clock they typed is
/// interpreted in THAT zone.

/// The zones offered in the authoring picker. Deliberately a short curated list rather than the
/// full ~600-entry IANA database: an admin picking a venue's zone wants the handful of places
/// this platform actually operates in, and a 600-item select is a worse tool for that than a
/// short one. Extend as the platform enters new markets.
export const EVENT_TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Berlin',
  'America/Toronto',
  'America/Vancouver',
  'America/New_York',
  'Pacific/Auckland',
  'UTC',
] as const

/// The zone to preselect for a new event — the admin's own, which is right far more often than
/// not and is a suggestion they can change rather than a hidden default.
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/// Converts a `datetime-local` wall-clock string ("2026-08-22T10:30") plus an IANA zone into the
/// UTC instant to store.
///
/// Works by asking the runtime how far the target zone sat from UTC *at that moment* and
/// correcting by it — so it stays right across a daylight-saving boundary instead of freezing
/// one offset. This is input marshalling, not a business rule: only the browser knows what the
/// admin typed, and the value it produces is the same instant any correct implementation would.
export function wallClockToUtcIso(wallClock: string, timeZone: string): string {
  // Read the typed clock as though it were UTC, then measure the target zone's offset there.
  const asIfUtc = new Date(`${wallClock}:00Z`)
  if (Number.isNaN(asIfUtc.getTime())) return new Date(wallClock).toISOString()
  const inZone = new Date(asIfUtc.toLocaleString('en-US', { timeZone }))
  const inUtc = new Date(asIfUtc.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMs = inZone.getTime() - inUtc.getTime()
  return new Date(asIfUtc.getTime() - offsetMs).toISOString()
}

/// The inverse, for populating the form when editing: the stored instant as a wall clock in the
/// event's own zone, so an admin editing a Mumbai meeting sees Mumbai's time rather than theirs.
export function utcIsoToWallClock(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// Platform-wide date convention (user-requested): every displayed date reads dd/mm/yyyy, not
// whatever the browser's locale would otherwise produce via toLocaleDateString().
export function formatDate(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function formatDateTime(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  return `${formatDate(d)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatTime(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * An event's start time, on the right clock.
 *
 * A Physical Meeting reads on the VENUE's clock and must never be converted to the viewer's zone
 * — an admin in Delhi looking at a London meeting has to see London's 18:30, not 23:00 (Phase E,
 * openapi Event schema: "converting it to their zone would tell them to arrive at the wrong
 * hour"). Mobile got this right from the start; immiNow was still passing `starts_at` through
 * `formatDateTime`, which is a plain JS Date and therefore the browser's zone — reproducing on
 * the console that authors these events the exact bug the server-computed fields exist to
 * prevent (contract audit, 2026-08-23).
 *
 * `starts_at_local` is parsed as TEXT, not through Date: the contract says it carries no offset
 * and must be printed verbatim, and routing it through a Date would quietly re-introduce a
 * conversion on any runtime that reads a bare timestamp as UTC.
 */
export function formatEventDateTime(event: {
  starts_at?: string | null
  starts_at_local?: string | null
  timezone_label?: string | null
  time_is_local_to_venue?: boolean | null
}): string {
  if (event.time_is_local_to_venue && event.starts_at_local) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(event.starts_at_local)
    if (parts) {
      const [, year, month, day, hour, minute] = parts
      const zone = event.timezone_label ? ` (${event.timezone_label})` : ''
      return `${day}/${month}/${year}, ${hour}:${minute}${zone}`
    }
  }
  // Webinars and quizzes genuinely belong in the viewer's own zone, so the plain path stays.
  return event.starts_at ? formatDateTime(event.starts_at) : ''
}

// M:SS for a duration under an hour (Quiz completion times never exceed the per-attempt time
// limit, itself in minutes), H:MM:SS beyond that. Used by the Quiz leaderboard's Time column.
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function isSameCalendarDay(a: string | Date, b: string | Date): boolean {
  return isSameDay(typeof a === 'string' ? new Date(a) : a, typeof b === 'string' ? new Date(b) : b)
}

// WhatsApp-style day divider: "Today" / "Yesterday", falling back to dd/mm/yyyy for anything older.
export function formatDayLabel(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  const now = new Date()
  if (isSameDay(d, now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(d, yesterday)) return 'Yesterday'
  return formatDate(d)
}

// Renders `student_preferences.intended_intake` (a `first_half`/`second_half` slug) against its
// paired `intended_year` — "Jan – Jun 2027".
//
// Lives here rather than in the one page that currently shows it because the slug is meaningless
// on screen: any surface that displays a student's intake has to translate it, and a second
// hand-rolled copy is how the two drift apart. The mobile app has the mirror of this in
// profile_screen.dart's `_intakeLabel`.
//
// The wording is deliberately not what's stored — only the slug is persisted, so this label can
// change without a data migration.
export function formatIntake(
  intake: 'first_half' | 'second_half' | null | undefined,
  year: number | null | undefined,
): string {
  if (!intake) return '—'
  const range = intake === 'first_half' ? 'Jan – Jun' : 'Jul – Dec'
  // Year is separately nullable: a student can pick a half before committing to a year, and a
  // range alone beats inventing one.
  return year ? `${range} ${year}` : range
}

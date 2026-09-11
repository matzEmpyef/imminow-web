import { browserTimezoneAbbreviation } from '@/lib/eventTimezones'

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

// A calendar date as YYYY-MM-DD on the browser's own clock — what "today" means to the person
// using the console. `toISOString().slice(0, 10)` is the UTC date instead, which in India reads
// as yesterday from midnight until 05:30 (2026-09-12). Use this for date-input defaults and
// minimums, "due today" comparisons and file names.
export function localDateISO(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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
 * An event's start time, on the right clock, captioned with which clock that is.
 *
 * A Physical Meeting reads on the VENUE's clock and must never be converted to the viewer's zone
 * — an admin in Delhi looking at a London meeting has to see London's 18:30, not 23:00 (Phase E,
 * openapi Event schema: "converting it to their zone would tell them to arrive at the wrong
 * hour"). A Webinar/Quiz's `starts_at_local` records the ADMIN'S own authoring clock instead — the
 * zone they were thinking in when they picked the time — which is what this console (the tool the
 * event was AUTHORED in) shows consistently across all three event pages (2026-09-11, "show the
 * timezone label consistently... so nobody has to guess which clock they're looking at"). The
 * Sentpo app is a separate client and still converts a webinar to each student's own zone; that
 * conversion has nothing to do with what the person who typed the time in this console needs to
 * see back.
 *
 * `starts_at_local` is parsed as TEXT, not through Date: the contract says it carries no offset
 * and must be printed verbatim, and routing it through a Date would quietly re-introduce a
 * conversion on any runtime that reads a bare timestamp as UTC.
 *
 * Falls back to the plain browser-zone rendering (and the browser's own zone abbreviation, not the
 * server's) only for an event authored before `timezone` existed, i.e. no `starts_at_local` at all.
 */
export function formatEventDateTime(event: {
  starts_at?: string | null
  starts_at_local?: string | null
  timezone_label?: string | null
}): string {
  if (event.starts_at_local) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(event.starts_at_local)
    if (parts) {
      const [, year, month, day, hour, minute] = parts
      const zone = event.timezone_label || browserTimezoneAbbreviation()
      return `${day}/${month}/${year}, ${hour}:${minute}${zone ? ` ${zone}` : ''}`
    }
  }
  if (!event.starts_at) return ''
  const zone = browserTimezoneAbbreviation()
  return `${formatDateTime(event.starts_at)}${zone ? ` ${zone}` : ''}`
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

// WhatsApp-style day divider: "Today" / "Yesterday" / "Tomorrow", falling back to dd/mm/yyyy for
// anything further off. "Tomorrow" (2026-08-29 addition) backs Activity's Coming Up timeline,
// which groups future dates by day — Yesterday/Today alone never needed a forward-looking label
// before this, since every other caller only ever day-divides past messages.
export function formatDayLabel(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  const now = new Date()
  if (isSameDay(d, now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(d, yesterday)) return 'Yesterday'
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (isSameDay(d, tomorrow)) return 'Tomorrow'
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

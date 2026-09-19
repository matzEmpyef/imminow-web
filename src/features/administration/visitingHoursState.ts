import { browserTimezone, EVENT_TIMEZONES } from '@/lib/eventTimezones'
import type { components } from '@/api/schema'

// The data half of {@link VisitingHoursEditor} — kept out of the component file so that one
// exports a component and nothing else (fast refresh), the same split the rest of this console
// uses for its form-state modules.

type VisitingSchedule = NonNullable<components['schemas']['Consultancy']['visiting_schedule']>

/** Sunday-first, matching the server's `weekday` numbering (0 = Sunday … 6 = Saturday). */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** What a day switched on starts at, before the office says otherwise. */
const DEFAULT_OPEN = '10:00'
const DEFAULT_CLOSE = '17:00'

/** One editor row, including the days that are closed — a day off is an answer, not a gap. */
export interface VisitingDayRow {
  open: boolean
  from: string
  to: string
}

export type VisitingHoursState = { timezone: string; days: VisitingDayRow[] }

/**
 * The full IANA list where the runtime can produce it, so an office in a zone this platform has
 * not entered yet can still say where it is. `EVENT_TIMEZONES` (the curated authoring list) is
 * the fallback, plus whatever zone is already selected, so the current value is never silently
 * dropped from its own select.
 */
export function timezoneOptions(selected: string): string[] {
  let zones: string[]
  try {
    zones = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    zones = []
  }
  if (zones.length === 0) zones = [...EVENT_TIMEZONES]
  return zones.includes(selected) || !selected ? zones : [selected, ...zones]
}

/** Seven rows from whatever the account has saved — no schedule at all means every day off. */
export function visitingHoursStateFrom(schedule: VisitingSchedule | null | undefined): VisitingHoursState {
  const days = WEEKDAYS.map((_, weekday) => {
    const saved = (schedule?.days ?? []).find((d) => d.weekday === weekday)
    return saved
      ? { open: true, from: saved.open, to: saved.close }
      : { open: false, from: DEFAULT_OPEN, to: DEFAULT_CLOSE }
  })
  return { timezone: schedule?.timezone || browserTimezone(), days }
}

/**
 * What to PATCH as `visiting_schedule`. Every day switched off sends `null` rather than an empty
 * `days` array: the server refuses a schedule with no days (it would mean an office that is never
 * open), and null is how "we have not set our own hours, use the platform default" is said.
 */
export function visitingScheduleFrom(state: VisitingHoursState): VisitingSchedule | null {
  const days = state.days
    .map((day, weekday) => ({ weekday, open: day.from, close: day.to, enabled: day.open }))
    .filter((d) => d.enabled)
    .map(({ weekday, open, close }) => ({ weekday, open, close }))
  if (days.length === 0) return null
  return { timezone: state.timezone, days }
}


/**
 * WHEN SOMEONE STARTS: a month, a year, and whether any month in that month's group would do
 * (assumptions audit M9, product owner 2026-09-19).
 *
 * This replaces the `first_half` / `second_half` calendar halves the console rendered and
 * filtered by. They were wrong twice over: a September start was filed as "second half" and
 * therefore measured from 1 July — three months early, on the very clock the "intake set, no
 * consultancy yet" queue counts days against — and six-month calendar blocks match no admissions
 * cycle any destination on this platform runs.
 *
 * THE GROUPS ARE NEVER CALLED "FALL" OR "SPRING" (product owner). Those are northern-hemisphere
 * marketing words, and an Australian February intake is not a "Spring" one. They are named for
 * the months they span, and nothing else.
 *
 * A student's own intake is WORDED BY THE SERVER (`intake_label`) so the console and the app can
 * never say the same intake two different ways; this module is the vocabulary a picker offers,
 * plus the same wording as a fallback for anything built locally.
 */

export const INTAKE_MONTHS: { value: number; name: string; short: string }[] = [
  { value: 1, name: 'January', short: 'Jan' },
  { value: 2, name: 'February', short: 'Feb' },
  { value: 3, name: 'March', short: 'Mar' },
  { value: 4, name: 'April', short: 'Apr' },
  { value: 5, name: 'May', short: 'May' },
  { value: 6, name: 'June', short: 'Jun' },
  { value: 7, name: 'July', short: 'Jul' },
  { value: 8, name: 'August', short: 'Aug' },
  { value: 9, name: 'September', short: 'Sep' },
  { value: 10, name: 'October', short: 'Oct' },
  { value: 11, name: 'November', short: 'Nov' },
  { value: 12, name: 'December', short: 'Dec' },
]

export type IntakeGroupCode = 'aug_dec' | 'jan_jul'

/**
 * The two spans the admissions year actually splits into for the destinations served. Aug–Dec is
 * listed first because it is the one most students on this platform start in, and because the
 * picker reads as a year running forward from the autumn entry.
 *
 * `anchor` is the month a whole-group pick sends — the group's FIRST month, which is what the
 * server stores alongside `any_in_group: true` so the group can be recovered from the month.
 */
export const INTAKE_GROUPS: { code: IntakeGroupCode; label: string; anchor: number; months: number[] }[] = [
  { code: 'aug_dec', label: 'August–December', anchor: 8, months: [8, 9, 10, 11, 12] },
  { code: 'jan_jul', label: 'January–July', anchor: 1, months: [1, 2, 3, 4, 5, 6, 7] },
]

export function intakeGroupOf(month: number | null | undefined) {
  if (month == null) return undefined
  return INTAKE_GROUPS.find((g) => g.months.includes(month))
}

export function intakeMonthName(month: number | null | undefined): string {
  return INTAKE_MONTHS.find((m) => m.value === month)?.name ?? ''
}

/**
 * The same sentence the server builds, for anything the console words itself — "September 2027",
 * or "Any month August–December 2027". Prefer the server's `intake_label` wherever a response
 * carries one; this exists so a picker can show what it is about to save.
 */
export function intakeLabelFor(intake: {
  month?: number | null
  year?: number | null
  any_in_group?: boolean
} | null | undefined): string {
  if (!intake) return ''
  const { month, year, any_in_group } = intake
  if (month == null) return year ? String(year) : ''
  const group = intakeGroupOf(month)
  const when = any_in_group && group ? `Any month ${group.label}` : intakeMonthName(month)
  return year ? `${when} ${year}` : when
}

/** This year through this year + 10 — the window the contract bounds `Intake.year` to. */
export function intakeYearOptions(now: Date = new Date()): number[] {
  const first = now.getFullYear()
  return Array.from({ length: 11 }, (_, i) => first + i)
}

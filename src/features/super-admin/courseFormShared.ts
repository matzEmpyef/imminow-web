import type { components } from '@/api/schema'

type Course = components['schemas']['Course']

// Shared between CollegeDetailPage (the completeness meter column) and the CourseFormModal
// panels (CourseFormPanels.tsx) — moved out of the page file in the 2026-08-25 decomposition.
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const FORM_TABS = ['Basics', 'Campuses & Intakes', 'Fees', 'Entry Requirements', 'Flags'] as const
export type FormTab = (typeof FORM_TABS)[number]

// Form-shaped (all strings/bools), not API-shaped — these mirror what the inputs hold, and
// CourseFormModal's buildRequirements() converts them to the API types on submit.
export type EnglishReq = { exam_id: string; min_overall: string; min_band: string }

/**
 * Whether an entrance exam is required is THREE-valued on the form (assumptions audit M37,
 * product owner 2026-09-19).
 *
 * It used to load as `a.required !== false` and a new row started at `true` — so an exam nobody
 * had ruled on became a hard requirement, and an optional GRE that arrived without the field
 * turned into one that fails applicants. `''` is "not stated"; the form will not save until the
 * admin has said which it is, because the wire contract has no null to carry the difference.
 */
export type AptitudeRequiredValue = '' | 'required' | 'optional'
export type AptitudeReq = { exam_id: string; min_score: string; required: AptitudeRequiredValue }

export const APTITUDE_REQUIRED_OPTIONS: { value: AptitudeRequiredValue; label: string }[] = [
  { value: '', label: 'Not set' },
  { value: 'required', label: 'Required' },
  { value: 'optional', label: 'Optional' },
]

/** `true`/`false`/absent from the server → the form's three values, explicitly, never defaulted. */
export function aptitudeRequiredFromServer(required: boolean | null | undefined): AptitudeRequiredValue {
  if (required === true) return 'required'
  if (required === false) return 'optional'
  return ''
}

/** The education level a course's minimum academic score is measured on (2026-09-17). Same codes
 * as a student's education rows, so the eligibility check compares like with like. */
export type EntryQualification = 'tenth' | 'twelfth' | 'diploma' | 'bachelors' | 'masters'

/** `''` is the form's "Not set" — a real answer, not a missing one (assumptions audit C1,
 * approved 2026-09-19). The pre-fill from the course level is gone: it was a guess ("anything
 * that isn't a Masters or a PhD reads the 12th") that got persisted as fact, and a Diploma course
 * saved without the dropdown being looked at then measured every applicant against a 12th score. */
export type EntryQualificationValue = EntryQualification | ''

// The OPTIONS came off a hand-kept list here until 2026-09-19. They are built from the served
// ladder now (assumptions audit M23, product owner) — `useLevelLadder().entryQualifications` in
// lib/studyLevels — because this was one of four copies of one ladder, in two vocabularies, and
// the copy that offered these five had no `phd` at all: a PhD programme could not state a
// Master's-and-above entry requirement, and a `phd` row rendered as the raw code.

/** How a minimum academic score is read. `''` is "Not set" for the same reason the qualification
 * has one (assumptions audit C3, approved 2026-09-19) — Percentage used to be pre-selected, so an
 * admin typing `3.5` from a 4-point GPA saved a 3.5 % floor that everybody clears. */
export type ScoreSchemeValue = '' | 'percentage' | 'cgpa_10' | 'cgpa_4'

export const SCORE_SCHEMES: { value: Exclude<ScoreSchemeValue, ''>; label: string }[] = [
  { value: 'percentage', label: 'Percentage' },
  { value: 'cgpa_10', label: 'CGPA (out of 10)' },
  { value: 'cgpa_4', label: 'CGPA (out of 4)' },
]

/** What a tuition figure covers. `''` is "not chosen yet" (assumptions audit H16, approved
 * 2026-09-19): Per year used to be pre-selected, so a college quoting "45,000 for the programme"
 * was saved as 45,000 A YEAR and every two-year comparison doubled it. The admin picks. */
export type FeePeriodValue = '' | 'per_year' | 'total'

export const FEE_PERIODS: { value: Exclude<FeePeriodValue, ''>; label: string }[] = [
  { value: 'per_year', label: 'Per year' },
  { value: 'total', label: 'Total programme' },
]

/** An intake month is Open, Closed, or nobody has said (assumptions audit C10, approved
 * 2026-09-19). Ticking nine months used to advertise nine OPEN intakes; `unknown` saves the
 * absence of an answer instead of inventing one. */
export type IntakeStatus = 'open' | 'closed' | 'unknown'

export const INTAKE_STATUSES: { value: IntakeStatus; label: string }[] = [
  { value: 'unknown', label: 'Not set' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
]

export const KNOWN_INTAKE_STATUSES: string[] = INTAKE_STATUSES.map((s) => s.value)

/**
 * What a saved status LOADS as (assumptions audit M37, product owner 2026-09-19).
 *
 * Explicit per value, and a value this build has never seen is kept VERBATIM so it survives the
 * round trip. The original defect was `d.status !== 'closed' ? 'open' : 'closed'` — a third
 * status was re-saved as `open`, publishing an intake as taking applications. C10 narrowed that
 * to `unknown`, which no longer lies but still discards whatever the server actually said; this
 * discards nothing. Missing is `unknown`, which is what the contract says absent means.
 */
export function intakeStatusFromServer(status: string | null | undefined): string {
  if (!status) return 'unknown'
  return status
}

/** Beside a date the server rolled forward a year rather than one a college confirmed — shown in
 * both deadline editors so an estimate never reads as the college's own date (C10). */
export const ROLLED_DEADLINE_NOTE = 'Estimated — rolled from last year'

export const TEXTAREA_CLASS = 'rounded-md border border-border bg-surface p-sm text-body text-text-primary'
export const SELECT_CLASS = 'h-10 rounded-md border border-border bg-surface px-3 text-body'

/**
 * Capture completeness (COURSES_MODULE_PLAN.md §5) — the meter that makes catalog quality
 * visible instead of hoped for. Seven checks: fee, duration_months, intake deadlines, entry
 * requirements block, language (required at capture since 2026-08-21 but legacy rows may lack
 * it), description (app review H8, 2026-09-13 — the app hides About the course when there is
 * none, so the course is listed with nothing to read), and campus (review C7, 2026-09-12 —
 * mirrors the server's COURSE_CAPTURE_CHECKS exactly:
 * a course fails this one only when it has no campus_ids AND its college actually has an active
 * campus to pick — a college with none yet cannot be faulted for a course that can't name one).
 */
export function courseCompleteness(
  course: Course,
  hasActiveCampuses: boolean,
): { done: number; total: number; missing: string[] } {
  const checks: Array<[string, boolean]> = [
    ['fee', course.fee?.amount != null],
    ['duration', course.duration_months != null],
    ['deadlines', (course.intake_deadlines ?? []).some((d) => d.application_deadline)],
    ['requirements', course.requirements != null],
    ['language', Boolean(course.language)],
    ['description', Boolean((course.description ?? '').trim())],
    ['campus', (course.campus_ids ?? []).length > 0 || !hasActiveCampuses],
  ]
  const missing = checks.filter(([, ok]) => !ok).map(([label]) => label)
  return { done: checks.length - missing.length, total: checks.length, missing }
}

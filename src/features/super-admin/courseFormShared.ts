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
export type AptitudeReq = { exam_id: string; min_score: string; required: boolean }

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

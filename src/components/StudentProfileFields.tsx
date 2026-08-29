import type { ReactNode } from 'react'
import { formatDate, formatIntake } from '@/lib/time'
import type { components } from '@/api/schema'

type StudentPreferences = components['schemas']['StudentPreferences']

function ProfileRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-md">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-right text-text-primary">
        {value ?? <span className="text-text-secondary">Not added yet</span>}
      </dd>
    </div>
  )
}

// C1: study_level and funding_source are closed wire enums (10th/11th/12th/diploma/bachelors/
// masters/phd and self/loan/scholarship_dependent) — labeled here rather than shown raw.
const STUDY_LEVEL_LABELS: Record<string, string> = {
  '10th': '10th',
  '11th': '11th',
  '12th': '12th',
  diploma: 'Diploma',
  bachelors: "Bachelor's",
  masters: "Master's",
  phd: 'PhD',
}

const FUNDING_SOURCE_LABELS: Record<string, string> = {
  self: 'Self-funded',
  loan: 'Loan',
  scholarship_dependent: 'Scholarship-dependent',
}

function formatEducation(entries?: components['schemas']['EducationEntry'][]): ReactNode {
  if (!entries || entries.length === 0) return null
  return (
    <div className="flex flex-col items-end gap-0.5">
      {entries.map((e, i) => (
        <span key={i} className="capitalize">
          {e.level}
          {e.stream ? ` — ${e.stream}` : ''}
          {e.score != null ? `, ${e.score}${e.scheme === 'percentage' ? '%' : ''}` : ''}
          {e.status === 'pursuing' ? ' (pursuing)' : ''}
        </span>
      ))}
    </div>
  )
}

function formatTestScores(entries?: components['schemas']['TestScoreEntry'][]): ReactNode {
  if (!entries || entries.length === 0) return null
  return (
    <div className="flex flex-col items-end gap-0.5">
      {entries.map((t, i) => (
        <span key={i}>
          {t.exam}: {t.status === 'completed' ? (t.score ?? 'scored') : t.status}
        </span>
      ))}
    </div>
  )
}

function formatWorkExperience(entries?: components['schemas']['WorkExperienceEntry'][]): ReactNode {
  if (!entries || entries.length === 0) return null
  return (
    <div className="flex flex-col items-end gap-0.5">
      {entries.map((w, i) => (
        <span key={i}>
          {w.title}
          {w.company ? ` at ${w.company}` : ''}
          {w.years ? ` (${w.years}y)` : ''}
        </span>
      ))}
    </div>
  )
}

/**
 * The slice of a student's profile relevant to picking a college/course — deliberately never
 * name, email, or phone (user, 2026-08-24: reached from Course Finder mid-search, not a contact
 * card). Every row renders even when empty, labeled "Not added yet" — the point is for the
 * consultant to see at a glance what's missing, same reasoning as the student's own profile-
 * completion meter naming gaps instead of hiding them.
 *
 * `prefs` null/undefined (an imported lead with no linked account, or a client/lead who hasn't
 * filled anything in) renders every row as "Not added yet" — callers with a genuinely different
 * message for "no account exists at all" (vs. "account exists, profile empty") render that
 * themselves instead of this component.
 *
 * Budget is the one field the student explicitly gates (`budget_shared`) — shown only when they
 * opted in; otherwise the row still appears, but says so rather than the figure.
 */
export function StudentProfileFields({ prefs }: { prefs: StudentPreferences | null | undefined }) {
  return (
    <dl className="flex flex-col gap-xs text-body-sm">
      <ProfileRow
        label="Study level"
        value={prefs?.study_level ? (STUDY_LEVEL_LABELS[prefs.study_level] ?? prefs.study_level) : null}
      />
      <ProfileRow
        label="Target countries"
        value={prefs?.target_countries && prefs.target_countries.length > 0 ? prefs.target_countries.join(', ') : null}
      />
      <ProfileRow
        label="Field(s) of interest"
        value={
          prefs?.fields_of_interest && prefs.fields_of_interest.length > 0 ? prefs.fields_of_interest.join(', ') : null
        }
      />
      <ProfileRow
        label="Intended intake"
        value={prefs?.intended_intake ? formatIntake(prefs.intended_intake, prefs.intended_year) : null}
      />
      <ProfileRow label="Date of birth" value={prefs?.date_of_birth ? formatDate(prefs.date_of_birth) : null} />
      <ProfileRow label="Education" value={formatEducation(prefs?.education)} />
      <ProfileRow label="Test scores" value={formatTestScores(prefs?.test_scores)} />
      <ProfileRow label="Work experience" value={formatWorkExperience(prefs?.work_experience)} />
      <ProfileRow
        label="Funding source"
        value={prefs?.funding_source ? (FUNDING_SOURCE_LABELS[prefs.funding_source] ?? prefs.funding_source) : null}
      />
      <ProfileRow
        label="Budget"
        value={
          !prefs
            ? null
            : prefs.budget_shared
              ? prefs.budget?.amount != null
                ? `${prefs.budget.amount.toLocaleString()} ${prefs.budget.currency ?? ''}`.trim()
                : null
              : 'Not shared by the applicant'
        }
      />
    </dl>
  )
}

import type { ReactNode } from 'react'
import { formatDate, formatIntake } from '@/lib/time'
import { formatMoney } from '@/lib/money'
import { STUDY_LEVEL_LABELS } from '@/lib/studyLevels'
import { genderLabel } from '@/lib/genders'
import { CountryLabel, CountryLabelList } from './CountryLabel'
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

// C1: funding_source is a closed wire enum (self/loan/scholarship_dependent) — labeled here rather
// than shown raw. Study level labels live in @/lib/studyLevels, shared with the Lead Pool table.
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

// `education_level` is server-derived from the education entries; shown only when there are no
// entries to show instead.
const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  tenth: '10th',
  twelfth: '12th',
  diploma: 'Diploma',
  bachelors: "Bachelor's",
  masters: "Master's",
}

const STUDY_MODE_LABELS: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
}

// `exam_status` is the server's per-exam summary ("ielts" -> "booked"). Detailed test_scores win
// when present; this covers profiles that only carry the summary, which is why a lead with
// "IELTS: booked" used to show "Not added yet" for tests.
function formatExamStatus(status?: { [key: string]: unknown } | null): ReactNode {
  const entries = Object.entries(status ?? {})
  if (entries.length === 0) return null
  return (
    <div className="flex flex-col items-end gap-0.5">
      {entries.map(([exam, state]) => (
        <span key={exam}>
          {exam.toUpperCase()}: {String(state)}
        </span>
      ))}
    </div>
  )
}

function formatVisaRefusals(entries?: components['schemas']['VisaRefusalEntry'][]): ReactNode {
  if (!entries || entries.length === 0) return null
  return (
    <div className="flex flex-col items-end gap-0.5">
      {entries.map((v, i) => (
        <span key={i}>
          {v.country}
          {v.year ? `, ${v.year}` : ''}
          {v.note ? ` — ${v.note}` : ''}
        </span>
      ))}
    </div>
  )
}

function formatLocation(prefs: StudentPreferences | null | undefined): ReactNode {
  const place = [prefs?.city, prefs?.district, prefs?.state].filter(Boolean).join(', ')
  if (!place && !prefs?.resident_country) return null
  return (
    <div className="flex flex-col items-end gap-0.5">
      {place && <span>{place}</span>}
      {prefs?.resident_country && <CountryLabel name={prefs.resident_country} />}
    </div>
  )
}

function formatInstitution(prefs: StudentPreferences | null | undefined): ReactNode {
  const name = prefs?.institution_name ?? prefs?.institution_raw
  if (!name) return null
  const city = prefs?.institution_name ? prefs?.institution_city : prefs?.institution_raw_city
  return city ? `${name}, ${city}` : name
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
  // EVERY field the profile carries (user, 2026-09-10: "I need all info in View study
  // preference"), grouped study plan, then background, then about the student. Still never name,
  // email or phone: those live on the lead/client record itself, not in this panel. Settings that
  // aren't about the student (display currency, blog topics) are deliberately left out.
  return (
    <dl className="flex flex-col gap-xs text-body-sm">
      <ProfileRow
        label="Study level"
        value={prefs?.study_level ? (STUDY_LEVEL_LABELS[prefs.study_level] ?? prefs.study_level) : null}
      />
      <ProfileRow
        label="Study mode"
        value={prefs?.preferred_study_mode ? STUDY_MODE_LABELS[prefs.preferred_study_mode] : null}
      />
      <ProfileRow
        label="Target countries"
        value={prefs?.target_countries?.length ? <CountryLabelList names={prefs.target_countries} /> : null}
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
      <ProfileRow
        label="Budget"
        value={
          !prefs
            ? null
            : prefs.budget_shared
              ? prefs.budget?.amount != null
                ? formatMoney(prefs.budget.currency, prefs.budget.amount)
                : null
              : 'Not shared by the applicant'
        }
      />
      <ProfileRow
        label="Funding source"
        value={prefs?.funding_source ? (FUNDING_SOURCE_LABELS[prefs.funding_source] ?? prefs.funding_source) : null}
      />
      <ProfileRow
        label="Education"
        value={
          formatEducation(prefs?.education) ??
          (prefs?.education_level ? EDUCATION_LEVEL_LABELS[prefs.education_level] : null)
        }
      />
      <ProfileRow
        label="Test scores"
        value={formatTestScores(prefs?.test_scores) ?? formatExamStatus(prefs?.exam_status)}
      />
      <ProfileRow label="Work experience" value={formatWorkExperience(prefs?.work_experience)} />
      <ProfileRow label="Visa refusals" value={formatVisaRefusals(prefs?.visa_refusals)} />
      <ProfileRow label="Date of birth" value={prefs?.date_of_birth ? formatDate(prefs.date_of_birth) : null} />
      <ProfileRow label="Gender" value={prefs?.gender ? genderLabel(prefs.gender) : null} />
      <ProfileRow label="Lives in" value={formatLocation(prefs)} />
      <ProfileRow label="School / institution" value={formatInstitution(prefs)} />
    </dl>
  )
}

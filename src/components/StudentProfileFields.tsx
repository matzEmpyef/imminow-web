import { Fragment, type ReactNode } from 'react'
import {
  BookOpen,
  Briefcase,
  Building2,
  Cake,
  CalendarDays,
  Clock,
  FileCheck2,
  Flag,
  Globe,
  GraduationCap,
  MapPin,
  PiggyBank,
  School,
  ShieldAlert,
  User,
  Wallet,
} from 'lucide-react'
import { formatDate, formatIntake } from '@/lib/time'
import { formatMoney } from '@/lib/money'
import { STUDY_LEVEL_LABELS } from '@/lib/studyLevels'
import { genderLabel } from '@/lib/genders'
import { CountryLabel, CountryLabelList } from './CountryLabel'
import { IconBadge } from './IconBadge'
import type { components } from '@/api/schema'

type StudentPreferences = components['schemas']['StudentPreferences']
type IconColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'

// C1: funding_source is a closed wire enum (self/loan/scholarship_dependent) — labeled here rather
// than shown raw. Study level labels live in @/lib/studyLevels, shared with the Lead Pool table.
const FUNDING_SOURCE_LABELS: Record<string, string> = {
  self: 'Self-funded',
  loan: 'Loan',
  scholarship_dependent: 'Scholarship-dependent',
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

// ---- value formatting, shared by the list and the panels ---------------------------------------
// Multi-entry fields come back as LINES, and each layout decides how to stack them: the list
// right-aligns them, the panels left-align them under their label.

type Lines = ReactNode[] | null

function educationLines(prefs: StudentPreferences | null | undefined): Lines {
  const entries = prefs?.education
  if (entries && entries.length > 0) {
    return entries.map((e, i) => (
      <span key={i}>
        {/* "12th", "Bachelor's" — not the stored codes "twelfth", "bachelors" (2026-09-10). */}
        {EDUCATION_LEVEL_LABELS[e.level] ?? e.level}
        {e.stream ? ` — ${e.stream}` : ''}
        {e.score != null ? `, ${e.score}${e.scheme === 'percentage' ? '%' : ''}` : ''}
        {e.status === 'pursuing' ? ' (pursuing)' : ''}
      </span>
    ))
  }
  return prefs?.education_level ? [EDUCATION_LEVEL_LABELS[prefs.education_level] ?? prefs.education_level] : null
}

// `exam_status` is the server's per-exam summary ("ielts" -> "booked"). Detailed test_scores win
// when present; this covers profiles that only carry the summary, which is why a lead with
// "IELTS: booked" used to show "Not added yet" for tests.
function testLines(prefs: StudentPreferences | null | undefined): Lines {
  const scores = prefs?.test_scores
  if (scores && scores.length > 0) {
    return scores.map((t, i) => (
      <span key={i}>
        {t.exam}: {t.status === 'completed' ? (t.score ?? 'scored') : t.status}
      </span>
    ))
  }
  const summary = Object.entries(prefs?.exam_status ?? {})
  if (summary.length === 0) return null
  return summary.map(([exam, state]) => (
    <span key={exam}>
      {exam.toUpperCase()}: {String(state)}
    </span>
  ))
}

function visaLines(prefs: StudentPreferences | null | undefined): Lines {
  const entries = prefs?.visa_refusals
  if (!entries || entries.length === 0) return null
  return entries.map((v, i) => (
    <span key={i}>
      {v.country}
      {v.year ? `, ${v.year}` : ''}
      {v.note ? ` — ${v.note}` : ''}
    </span>
  ))
}

function workLines(prefs: StudentPreferences | null | undefined): Lines {
  const entries = prefs?.work_experience
  if (!entries || entries.length === 0) return null
  return entries.map((w, i) => (
    <span key={i}>
      {w.title}
      {w.company ? ` at ${w.company}` : ''}
      {w.years ? ` (${w.years}y)` : ''}
    </span>
  ))
}

function locationLines(prefs: StudentPreferences | null | undefined): Lines {
  const place = [prefs?.city, prefs?.district, prefs?.state].filter(Boolean).join(', ')
  if (!place && !prefs?.resident_country) return null
  const lines: ReactNode[] = []
  if (place) lines.push(<span key="place">{place}</span>)
  if (prefs?.resident_country) lines.push(<CountryLabel key="country" name={prefs.resident_country} />)
  return lines
}

function institutionText(prefs: StudentPreferences | null | undefined): string | null {
  const name = prefs?.institution_name ?? prefs?.institution_raw
  if (!name) return null
  const city = prefs?.institution_name ? prefs?.institution_city : prefs?.institution_raw_city
  return city ? `${name}, ${city}` : name
}

// Target countries as plain flag + name text for the popup panels (user, 2026-09-10: "no need to
// show it in pill"), spaced apart rather than comma-separated — the flag already separates them,
// and a comma after the label's own trailing space read as "Canada , Ireland". The plain list
// keeps its chips.
function plainCountries(names: string[]): ReactNode {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-md gap-y-0.5">
      {names.map((n) => (
        <CountryLabel key={n} name={n} />
      ))}
    </span>
  )
}

/** Every profile fact, in display order, with the one icon and colour each one uses. */
function profileFacts(prefs: StudentPreferences | null | undefined, { countryPills = true } = {}) {
  // Keyed, because `lines` renders as a list and an element here (the target-countries label)
  // would otherwise trip React's missing-key warning.
  const one = (v: ReactNode | null | undefined): Lines => (v == null || v === '' ? null : [<Fragment key="v">{v}</Fragment>])
  return {
    studyPlan: [
      {
        label: 'Study level',
        icon: <GraduationCap className="h-5 w-5" />,
        color: 'primary' as IconColor,
        lines: one(prefs?.study_level ? (STUDY_LEVEL_LABELS[prefs.study_level] ?? prefs.study_level) : null),
      },
      {
        // "Preferred" — it is what the student would like, not a mode anyone has fixed (2026-09-10).
        label: 'Preferred study mode',
        icon: <Clock className="h-5 w-5" />,
        color: 'success' as IconColor,
        lines: one(prefs?.preferred_study_mode ? STUDY_MODE_LABELS[prefs.preferred_study_mode] : null),
      },
      {
        label: 'Intended intake',
        icon: <CalendarDays className="h-5 w-5" />,
        color: 'info' as IconColor,
        lines: one(prefs?.intended_intake ? formatIntake(prefs.intended_intake, prefs.intended_year) : null),
      },
      {
        label: 'Field(s) of interest',
        icon: <BookOpen className="h-5 w-5" />,
        color: 'primary' as IconColor,
        lines: one(prefs?.fields_of_interest?.length ? prefs.fields_of_interest.join(', ') : null),
      },
      {
        label: 'Target countries',
        icon: <Globe className="h-5 w-5" />,
        color: 'secondary' as IconColor,
        lines: one(
          prefs?.target_countries?.length
            ? countryPills
              ? <CountryLabelList names={prefs.target_countries} />
              : plainCountries(prefs.target_countries)
            : null,
        ),
      },
      {
        // Budget is the one field the student explicitly gates (`budget_shared`) — shown only when
        // they opted in; otherwise it still appears, but says so rather than the figure.
        label: 'Budget',
        icon: <Wallet className="h-5 w-5" />,
        color: 'secondary' as IconColor,
        lines: one(
          !prefs
            ? null
            : prefs.budget_shared
              ? prefs.budget?.amount != null
                ? formatMoney(prefs.budget.currency, prefs.budget.amount)
                : null
              : 'Not shared by the applicant',
        ),
      },
      {
        label: 'Funding source',
        icon: <PiggyBank className="h-5 w-5" />,
        color: 'warning' as IconColor,
        lines: one(prefs?.funding_source ? (FUNDING_SOURCE_LABELS[prefs.funding_source] ?? prefs.funding_source) : null),
      },
    ],
    background: [
      { label: 'Education', icon: <School className="h-5 w-5" />, color: 'primary' as IconColor, lines: educationLines(prefs) },
      { label: 'Test scores', icon: <FileCheck2 className="h-5 w-5" />, color: 'info' as IconColor, lines: testLines(prefs) },
      { label: 'Work experience', icon: <Briefcase className="h-5 w-5" />, color: 'warning' as IconColor, lines: workLines(prefs) },
      { label: 'Visa refusals', icon: <ShieldAlert className="h-5 w-5" />, color: 'error' as IconColor, lines: visaLines(prefs) },
    ],
    about: [
      {
        label: 'Date of birth',
        icon: <Cake className="h-5 w-5" />,
        color: 'secondary' as IconColor,
        lines: one(prefs?.date_of_birth ? formatDate(prefs.date_of_birth) : null),
      },
      {
        label: 'Gender',
        icon: <User className="h-5 w-5" />,
        color: 'info' as IconColor,
        lines: one(prefs?.gender ? genderLabel(prefs.gender) : null),
      },
      { label: 'Lives in', icon: <MapPin className="h-5 w-5" />, color: 'success' as IconColor, lines: locationLines(prefs) },
      {
        label: 'School / institution',
        icon: <Building2 className="h-5 w-5" />,
        color: 'primary' as IconColor,
        lines: one(institutionText(prefs)),
      },
    ],
  }
}

// ---- the plain list (Client Profile Overview, the lead page) -----------------------------------

function ProfileRow({ label, lines }: { label: string; lines: Lines }) {
  return (
    <div className="flex items-start justify-between gap-md">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-right text-text-primary">
        {lines ? (
          <div className="flex flex-col items-end gap-0.5">{lines}</div>
        ) : (
          <span className="text-text-secondary">Not added yet</span>
        )}
      </dd>
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
 * EVERY field the profile carries (user, 2026-09-10: "I need all info in View study preference"),
 * grouped study plan, then background, then about the student. Settings that aren't about the
 * student (display currency, blog topics) are deliberately left out.
 */
export function StudentProfileFields({ prefs }: { prefs: StudentPreferences | null | undefined }) {
  const facts = profileFacts(prefs)
  return (
    <dl className="flex flex-col gap-xs text-body-sm">
      {[...facts.studyPlan, ...facts.background, ...facts.about].map((f) => (
        <ProfileRow key={f.label} label={f.label} lines={f.lines} />
      ))}
    </dl>
  )
}

// ---- the panels (lead and client detail popups) ------------------------------------------------

function Fact({ icon, color, label, lines }: { icon: ReactNode; color: IconColor; label: string; lines: Lines }) {
  return (
    <div className="flex min-w-0 items-start gap-sm">
      <IconBadge color={color}>{icon}</IconBadge>
      <div className="min-w-0">
        <dt className="text-caption text-text-secondary">{label}</dt>
        <dd className="text-body-sm font-medium text-text-primary">
          {lines ? (
            <div className="flex flex-col items-start gap-0.5">{lines}</div>
          ) : (
            <span className="font-normal italic text-text-secondary">Not added yet</span>
          )}
        </dd>
      </div>
    </div>
  )
}

function Panel({ title, surface, children }: { title: string; surface?: boolean; children: ReactNode }) {
  return (
    <section
      className={`flex flex-col gap-md rounded-lg border border-border p-lg ${surface ? 'bg-surface' : 'bg-background'}`}
    >
      <h3 className="text-h3 text-text-primary">{title}</h3>
      <dl className="grid grid-cols-1 gap-x-lg gap-y-md sm:grid-cols-2">{children}</dl>
    </section>
  )
}

/**
 * The same facts as {@link StudentProfileFields}, laid out for the lead and client detail popups
 * (user, 2026-09-10: "can you improve this UI too.. both lead and client details popup"): three
 * panels of icon tiles, with a completeness bar on top so what's missing reads at a glance.
 * `extraStudyFacts` lets a caller add a fact of its own to Study Plan (the client's finalized
 * country); it is shown but not counted in the bar, which measures the student's own profile.
 */
export function StudentProfilePanels({
  prefs,
  extraStudyFacts = [],
  surface = false,
  omit = [],
}: {
  prefs: StudentPreferences | null | undefined
  extraStudyFacts?: { label: string; icon: ReactNode; color: IconColor; lines: Lines }[]
  /** White panels, for a page where they sit on a white card (client Overview, 2026-09-10). */
  surface?: boolean
  /** Fact labels a page shows elsewhere and leaves out here — neither shown nor counted. */
  omit?: string[]
}) {
  const full = profileFacts(prefs, { countryPills: false })
  const keep = <T extends { label: string }>(list: T[]) => list.filter((f) => !omit.includes(f.label))
  const facts = { studyPlan: keep(full.studyPlan), background: keep(full.background), about: keep(full.about) }
  const studyPlan = [...extraStudyFacts, ...facts.studyPlan]
  // Completeness counts only what the STUDENT fills in — the same 15 for a lead and a client. A
  // caller's extra fact (the client's Finalized country, which the consultancy sets) is shown but
  // not counted, or an applicant would read "of 16" against a lead's "of 15" for the same profile.
  // An omitted fact is not counted either: the bar measures what the page actually shows.
  const all = [...facts.studyPlan, ...facts.background, ...facts.about]
  const added = all.filter((f) => f.lines).length
  const pct = Math.round((added / all.length) * 100)

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-col gap-xs">
        <div className="flex items-center justify-between text-body-sm">
          <span className="font-medium text-text-primary">Profile completeness</span>
          <span className="text-text-secondary">
            {added} of {all.length} details added
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-background">
          <div
            className={`h-2 rounded-full ${pct >= 75 ? 'bg-success' : pct >= 40 ? 'bg-primary' : 'bg-warning'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <Panel title="Study Plan" surface={surface}>
        {studyPlan.map((f) => (
          <Fact key={f.label} {...f} />
        ))}
      </Panel>
      <Panel title="Background" surface={surface}>
        {facts.background.map((f) => (
          <Fact key={f.label} {...f} />
        ))}
      </Panel>
      <Panel title="About" surface={surface}>
        {facts.about.map((f) => (
          <Fact key={f.label} {...f} />
        ))}
      </Panel>
    </div>
  )
}

export const FinalizedCountryIcon = Flag

import { useState, type ReactNode } from 'react'
import {
  Award,
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  Clock,
  ExternalLink,
  FileCheck2,
  GraduationCap,
  Languages,
  MapPin,
  Receipt,
  Wallet,
} from 'lucide-react'
import { Modal } from '@/components/Modal'
import { CountryLabel } from '@/components/CountryLabel'
import { Badge } from '@/components/Badge'
import { IconBadge } from '@/components/IconBadge'
import { Skeleton } from '@/components/QueryState'
import { SuggestCorrectionButton } from '@/features/clients/SuggestCorrectionButton'
import { IntakeDeadlineEditor } from '@/features/clients/IntakeDeadlineEditor'
import { useExams } from '@/queries/catalogSettings'
import { useCollegeDetail } from '@/queries/adminColleges'
import { useAuthStore } from '@/stores/authStore'
import { labelFor } from '@/lib/humanise'
import { scoreSchemeSuffix } from '@/lib/scoreScheme'
import { formatCourseFee, formatFeeApprox } from '@/lib/money'
import { formatDate } from '@/lib/time'
import type { components } from '@/api/schema'
import { mediaUrl } from '@/lib/mediaUrl'
import { ROLLED_DEADLINE_NOTE } from '@/features/super-admin/courseFormShared'
import { IntakeStatusBadge } from '@/features/super-admin/IntakeStatusBadge'
import { useLevelLadder } from '@/lib/studyLevels'
import { DetailSection as Section } from './DetailSection'

type Course = components['schemas']['Course']
type IntakeDeadline = components['schemas']['IntakeDeadline']
type IconColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'

const STUDY_MODE_LABELS: Record<string, string> = { full_time: 'Full time', part_time: 'Part time' }
const DELIVERY_LABELS: Record<string, string> = { on_campus: 'On campus', hybrid: 'Hybrid', online: 'Online' }
// A score with no scheme is NOT a percentage (assumptions audit M38, product owner 2026-09-19) —
// "8.5" and "8.5%" are different requirements, and defaulting to `%` made a CGPA minimum read as
// a percentage anyone clears. An unrecognised scheme names itself rather than printing no unit.

// A value with its "suggest a correction" pencil (see SuggestCorrectionButton for what counts as
// correctable). Prose — description, eligibility, benefits — passes `correctable={false}`: a wrong
// fee misleads a student, "this could be phrased better" is a different kind of feedback.
function Known({
  course,
  value,
  field,
  label,
  numeric,
  correctable = true,
}: {
  course: Course
  value: string
  field: string
  label: string
  numeric?: boolean
  correctable?: boolean
}) {
  return (
    <span className="group inline-flex items-center">
      <span>{value}</span>
      {correctable && (
        <SuggestCorrectionButton courseId={course.id} field={field} label={label} current={value} numeric={numeric} />
      )}
    </span>
  )
}

function Fact({ icon, color, label, children }: { icon: ReactNode; color: IconColor; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-sm">
      <IconBadge color={color}>{icon}</IconBadge>
      <div className="min-w-0">
        <p className="text-caption text-text-secondary">{label}</p>
        <div className="text-body-sm font-medium text-text-primary">{children}</div>
      </div>
    </div>
  )
}

function RequirementRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-md border-b border-border py-xs">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-right text-text-primary">{children}</dd>
    </div>
  )
}

/**
 * The whole COURSE, as a consultant sees it from Course Finder. Restyled 2026-09-10 after a
 * reference the user shared (identity header, a Key Details panel of icon tiles, an Intake &
 * Deadlines table), recoloured to the theme. Two rules came with it:
 *
 * - EVERY field the catalogue collects is shown, including the ones this course has no value for.
 *   A missing value reads "Not provided" (or "Not listed"/"None listed" where a false or absent
 *   value could mean either "no" or "we don't know") with a "+ Add" button beside it.
 * - "+ Add" goes through the same review queue as the correction pencil, so a consultant who knows
 *   the missing fact can supply it and a Platform Admin approves it before it reaches students.
 *
 * Needs no fetch: Course Finder's `/courses` rows are already full `Course` objects.
 */
export function CourseDetailModal({ course, onClose }: { course: Course; onClose: () => void }) {
  const exams = useExams()
  const examName = (examId: string) => exams.data?.find((e) => e.id === examId)?.name ?? examId
  // One served education ladder (assumptions audit M23, product owner 2026-09-19).
  const ladder = useLevelLadder()
  // The college, for a collected fact the Course row can't show alone (user, 2026-09-10: "I told
  // you to display all the details collected"): WHICH campuses offer the course — the row only
  // carries campus_ids.
  const college = useCollegeDetail(course.college_id ?? undefined)
  const offeredCampuses = (college.data?.campuses ?? []).filter((c) => (course.campus_ids ?? []).includes(c.id))

  // Every missing field rendered below registers here, so the count in the notice at the top can
  // never disagree with what the popup actually shows as missing.
  const gaps: string[] = []
  function gap(field: string, label: string, text = 'Not provided', numeric = false) {
    gaps.push(label)
    return (
      <span className="inline-flex flex-wrap items-center gap-xs font-normal">
        <span className="italic text-text-secondary">{text}</span>
        <SuggestCorrectionButton courseId={course.id} field={field} label={label} current={null} numeric={numeric} />
      </span>
    )
  }
  function show(value: string | null | undefined, field: string, label: string, missingText?: string, numeric = false) {
    return value
      ? <Known course={course} value={value} field={field} label={label} numeric={numeric} />
      : gap(field, label, missingText, numeric)
  }

  const req = course.requirements
  const fee =
    course.fee?.amount != null
      ? `${formatCourseFee(course.fee, course.fee_period)}${course.fee_period === 'total' ? ' (whole programme)' : ''}`
      : null
  const appFee = course.application_fee?.amount != null ? formatCourseFee(course.application_fee, null) : null
  // "70% minimum in Bachelor's" — the level the score is measured on, when the course names one.
  // From the served ladder (assumptions audit M23, product owner 2026-09-19) — the hand-kept
  // five this read had no `phd`, so a course requiring one showed no level at all.
  const qualification = req?.academic?.entry_qualification ? ladder.label(req.academic.entry_qualification) : undefined
  const academic =
    req?.academic?.min_score != null
      ? `${req.academic.min_score}${scoreSchemeSuffix(req.academic.scheme)} minimum${qualification ? ` in ${qualification}` : ''}`
      : null

  // Intake rows: every month with deadline data, then any listed intake that has none yet.
  const deadlines = course.intake_deadlines ?? []
  const intakeRows = [
    ...deadlines.map((d) => ({ month: d.month, deadline: d })),
    ...(course.intakes ?? [])
      .filter((m) => !deadlines.some((d) => d.month === m))
      .map((month) => ({ month, deadline: undefined })),
  ]

  // Set Intake Deadline (2026-09-17 spec) — consultancy staff only; Platform Admins edit the
  // course itself in Course Setup instead. Mirrors ConsultancyRoute's own role check (the only
  // two roles that route ever admits) rather than trusting "this modal is only mounted in the
  // consultancy area" to stay true forever — ChatPanel and CourseFinderPage both mount this popup
  // today, but neither is what actually enforces who may set a deadline.
  const role = useAuthStore((s) => s.user?.role)
  const canSetIntakeDeadlines = role === 'consultancy_admin' || role === 'consultant'

  // A 200 response applies straight to the catalogue, but `course` here is a frozen snapshot
  // handed down by the caller (Course Finder's row, a chat's shared-course card) — nothing
  // re-fetches it just because this popup is open. Without this, "the row shows the new date
  // immediately" would depend on the caller re-rendering with a fresh `course` prop, which none
  // of today's callers do. Keyed by month since deadlines are unique per month on one course.
  // Each override is the whole entry the server returned, never a status worked out here: status
  // is derived by the server from the date (2026-09-24).
  const [deadlineOverrides, setDeadlineOverrides] = useState<Record<string, IntakeDeadline>>({})

  // ---- header ------------------------------------------------------------------------------
  const header = (
    <div className="flex min-w-0 flex-1 items-start gap-lg">
      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        {course.college_logo_url ? (
          <img src={mediaUrl(course.college_logo_url)} alt="" className="h-16 w-16 rounded-md bg-surface object-contain p-xs" />
        ) : (
          <span className="text-h1 font-semibold text-primary">{(course.college_name ?? '?').charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-xs">
        <div className="flex flex-wrap items-center gap-xs">
          {course.level && (
            <Badge color="primary" className="capitalize">
              {course.level}
            </Badge>
          )}
          {course.credentials ? (
            <Badge color="secondary">{course.credentials}</Badge>
          ) : (
            <span className="inline-flex items-center gap-xs rounded-full border border-dashed border-border px-sm text-caption text-text-secondary">
              {gap('credentials', 'Credential', 'Credential')}
            </span>
          )}
          {/* `active` and `visible` can disagree — a course can be individually active but still
              hidden because its COLLEGE is off (build reference 1.11), so both are checked. */}
          {!course.active ? (
            <Badge color="error">Inactive</Badge>
          ) : course.visible === false ? (
            <Badge color="warning">Hidden — college inactive</Badge>
          ) : null}
          {course.most_viewed && <Badge color="info">Most viewed</Badge>}
        </div>
        <h2 className="text-h2 text-text-primary">{course.name}</h2>
        <p className="flex flex-wrap items-center gap-xs text-body text-text-secondary">
          <span>
            {course.college_name}
            {course.campus_city ? `, ${course.campus_city}` : ''}
          </span>
          {course.country && (
            <>
              <span aria-hidden>|</span>
              <CountryLabel name={course.country} />
            </>
          )}
        </p>
      </div>
      {/* Right side of the header, as on the college popup: the course's own page (the admin form's
          "Course Page"), and only that (user, 2026-09-10: "I want course page url, not College
          website"). A course without one offers + Add instead. */}
      <div className="flex shrink-0 flex-col items-end gap-xs self-center">
        {course.course_url ? (
          <a
            href={course.course_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-xs rounded-full bg-primary px-md text-button font-medium text-text-on-primary shadow-card hover:opacity-90"
          >
            Course Details
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        ) : (
          <span className="inline-flex items-center gap-xs text-body-sm text-text-primary">
            Course Page: {gap('course_url', 'Course Page')}
          </span>
        )}
      </div>
    </div>
  )

  // ---- body --------------------------------------------------------------------------------
  const about = (
    <div className="text-body-sm text-text-secondary">
      {course.description ? course.description : gap('description', 'Description')}
    </div>
  )

  const keyDetails = (
    <Section title="Key Details">
      <div className="grid grid-cols-2 gap-x-lg gap-y-md md:grid-cols-3">
        <Fact icon={<BookOpen className="h-5 w-5" />} color="primary" label="Field of study">
          {show(course.field_of_study, 'field_of_study', 'Field of study')}
        </Fact>
        <Fact icon={<CalendarDays className="h-5 w-5" />} color="success" label="Intakes">
          {show((course.intakes ?? []).join(', ') || null, 'intakes', 'Intakes')}
        </Fact>
        <Fact icon={<Building2 className="h-5 w-5" />} color="info" label="Delivery">
          {show(labelFor(DELIVERY_LABELS, course.delivery) || null, 'delivery', 'Delivery')}
        </Fact>
        <Fact icon={<Clock className="h-5 w-5" />} color="success" label="Duration">
          {/* The display text, plus the normalised months (used by filters) when the text doesn't
              already say it, e.g. "2 years" becomes "2 years (24 months)". */}
          {show(
            course.duration
              ? course.duration_months != null && !course.duration.includes(String(course.duration_months))
                ? `${course.duration} (${course.duration_months} months)`
                : course.duration
              : course.duration_months != null
                ? `${course.duration_months} months`
                : null,
            'duration',
            'Duration',
          )}
        </Fact>
        <Fact icon={<Languages className="h-5 w-5" />} color="info" label="Language">
          {show(course.language, 'language', 'Language')}
        </Fact>
        <Fact icon={<Briefcase className="h-5 w-5" />} color="warning" label="Co-op">
          {course.coop_available
            ? <Known course={course} value="Available" field="coop_available" label="Co-op availability" />
            : gap('coop_available', 'Co-op availability', 'Not listed')}
        </Fact>
        <Fact icon={<Wallet className="h-5 w-5" />} color="secondary" label="Tuition fee">
          {show(fee, 'fee.amount', 'Tuition fee', undefined, true)}
          {/* The college's own fee stays the headline; this is the consultant's own currency
              beside it when the two differ (2026-09-10). */}
          {formatFeeApprox(course.fee_display) && (
            <p className="text-caption font-normal text-text-secondary">{formatFeeApprox(course.fee_display)}</p>
          )}
        </Fact>
        <Fact icon={<GraduationCap className="h-5 w-5" />} color="primary" label="Study mode">
          {show(
            labelFor(STUDY_MODE_LABELS, course.study_mode) || null,
            'study_mode',
            'Study mode',
          )}
        </Fact>
        <Fact icon={<FileCheck2 className="h-5 w-5" />} color="secondary" label="Post-study work">
          {course.post_study_work_eligible
            ? <Known course={course} value="Eligible" field="post_study_work_eligible" label="Post-study work eligibility" />
            : gap('post_study_work_eligible', 'Post-study work eligibility', 'Not listed')}
        </Fact>
        <Fact icon={<Receipt className="h-5 w-5" />} color="warning" label="Application fee">
          {appFee ? (
            <span className="inline-flex flex-wrap items-center gap-xs">
              <Known course={course} value={appFee} field="application_fee.amount" label="Application fee" numeric />
              {course.application_fee_waived && <Badge color="success">Waivable</Badge>}
            </span>
          ) : (
            gap('application_fee.amount', 'Application fee', 'Not provided', true)
          )}
        </Fact>
        <Fact icon={<MapPin className="h-5 w-5" />} color="info" label="Campuses">
          {(course.campus_ids ?? []).length === 0
            ? gap('campus_ids', 'Campuses', 'None linked')
            : offeredCampuses.length > 0
              ? offeredCampuses.map((c) => [c.city, c.province_state].filter(Boolean).join(', ') || c.country).join(' · ')
              : college.isLoading
                ? // A bar, not the word "Loading…" (console review M5, 2026-09-13) — text in a
                  // fact tile reads as the fact itself, so the tile looked like it was answering
                  // the question rather than still fetching the college.
                  <Skeleton className="h-4 w-24 rounded-sm" />
                : `${(course.campus_ids ?? []).length} linked`}
        </Fact>
        <Fact icon={<Award className="h-5 w-5" />} color="primary" label="Scholarship">
          {course.scholarship_available
            ? <Known course={course} value={course.scholarship_note ?? 'Available'} field="scholarship_available" label="Scholarship" />
            : gap('scholarship_available', 'Scholarship', 'Not listed')}
        </Fact>
      </div>
    </Section>
  )

  const intakes = (
    <Section title="Intake & Deadlines">
      <div className="overflow-x-auto rounded-md border border-border bg-surface">
        <table className="w-full text-left text-body-sm">
          <thead className="bg-background text-caption text-text-secondary">
            <tr>
              <th className="px-md py-sm font-medium">Intake</th>
              <th className="px-md py-sm font-medium">Application deadline</th>
              <th className="px-md py-sm font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {intakeRows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-md py-sm">
                  {gap('intakes', 'Intakes', 'No intakes provided')}
                </td>
              </tr>
            ) : (
              intakeRows.map(({ month, deadline }) => {
                // The override, if this row's deadline was set (applied=true) earlier in this
                // popup's lifetime, in place of what the course prop originally carried — replaced
                // whole, so a stale status or rolled flag from the old date never survives.
                const merged = deadline ? (deadlineOverrides[month] ?? deadline) : undefined
                return (
                  <tr key={month} className="border-t border-border">
                    <td className="px-md py-sm text-text-primary">
                      <span className="inline-flex items-center gap-xs">
                        {month}
                        {course.next_intake?.month === month && <Badge color="primary">Next</Badge>}
                      </span>
                    </td>
                    <td className="px-md py-sm text-text-primary">
                      {/* The direct Set Deadline editor only for a row that already has an
                          IntakeDeadline entry (`merged` truthy) — the endpoint 404s for a month
                          with none at all — and only for consultancy staff. Everyone else keeps
                          the older suggest-a-correction pencil, same as every other catalogue fact
                          on this popup. */}
                      {merged && canSetIntakeDeadlines ? (
                        <span className="inline-flex items-center gap-xs">
                          {merged.application_deadline ? (
                            formatDate(merged.application_deadline)
                          ) : (
                            <span className="italic text-text-secondary">Rolling admission</span>
                          )}
                          {/* An estimate the server rolled forward, never the college's own date
                              (assumptions audit C10, approved 2026-09-19). */}
                          {merged.rolled && (
                            <span className="text-caption text-text-secondary">{ROLLED_DEADLINE_NOTE}</span>
                          )}
                          <IntakeDeadlineEditor
                            courseId={course.id}
                            month={month}
                            currentDeadline={merged.application_deadline ?? null}
                            rolled={Boolean(merged.rolled)}
                            onApplied={(next) => setDeadlineOverrides((o) => ({ ...o, [month]: next }))}
                          />
                        </span>
                      ) : merged?.application_deadline ? (
                        <span className="inline-flex flex-col">
                          <Known course={course} value={formatDate(merged.application_deadline)} field={`intake_deadline.${month}`} label={`${month} application deadline`} />
                          {merged.rolled && (
                            <span className="text-caption text-text-secondary">{ROLLED_DEADLINE_NOTE}</span>
                          )}
                        </span>
                      ) : (
                        gap(`intake_deadline.${month}`, `${month} application deadline`)
                      )}
                    </td>
                    <td className="px-md py-sm">
                      {/* Read-only, as the server derived it from the deadline (2026-09-24). */}
                      <IntakeStatusBadge status={merged?.status} deadline={merged?.application_deadline} />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </Section>
  )

  const requirements = (
    <Section title="Entry Requirements">
      <dl className="grid grid-cols-1 gap-x-xl text-body-sm md:grid-cols-2">
        <RequirementRow label="Academic">
          {show(academic, 'requirement.academic', 'Academic requirement', 'None listed')}
        </RequirementRow>
        <RequirementRow label="Background">
          {show(req?.academic?.required_background, 'requirement.background', 'Required background', 'None listed')}
        </RequirementRow>
        <RequirementRow label="Maximum backlogs">
          {show(
            req?.academic?.max_backlogs != null ? String(req.academic.max_backlogs) : null,
            'requirement.max_backlogs',
            'Maximum backlogs',
            'None listed',
          )}
        </RequirementRow>
        {(req?.english ?? []).length > 0 ? (
          (req?.english ?? []).map((e) => (
            <RequirementRow key={e.exam_id} label={examName(e.exam_id)}>
              <Known
                course={course}
                value={`${e.min_overall}${e.min_band != null ? ` (min ${e.min_band} per band)` : ''}`}
                field={`requirement.english.${examName(e.exam_id)}`}
                label={`${examName(e.exam_id)} requirement`}
              />
            </RequirementRow>
          ))
        ) : (
          <RequirementRow label="English test">
            {gap('requirement.english', 'English test requirement', 'None listed')}
          </RequirementRow>
        )}
        <RequirementRow label="MOI accepted">
          {req?.moi_accepted
            ? <Known course={course} value="Yes" field="requirement.moi_accepted" label="MOI accepted" />
            : gap('requirement.moi_accepted', 'MOI accepted', 'Not listed')}
        </RequirementRow>
        {(req?.aptitude ?? []).length > 0 ? (
          (req?.aptitude ?? []).map((a) => (
            <RequirementRow key={a.exam_id} label={examName(a.exam_id)}>
              <Known
                course={course}
                // Tri-state, not "required unless explicitly false" (assumptions audit M37,
                // product owner 2026-09-19) — an exam nobody has answered for reads as not
                // stated, never as a hard requirement a student would rule themselves out on.
                value={`${a.min_score}${a.required == null ? ' · required or optional not stated' : a.required ? ' · required' : ' · optional'}`}
                field={`requirement.aptitude.${examName(a.exam_id)}`}
                label={`${examName(a.exam_id)} requirement`}
              />
            </RequirementRow>
          ))
        ) : (
          <RequirementRow label="Aptitude test">
            {gap('requirement.aptitude', 'Aptitude test requirement', 'None listed')}
          </RequirementRow>
        )}
        <RequirementRow label="Work experience">
          {show(
            req?.min_work_experience_months ? `${req.min_work_experience_months} months minimum` : null,
            'requirement.work_experience',
            'Work experience requirement',
            'None listed',
          )}
        </RequirementRow>
        <RequirementRow label="Interview">
          {req?.info_flags?.interview_required
            ? <Known course={course} value="Required" field="requirement.interview" label="Interview requirement" />
            : gap('requirement.interview', 'Interview requirement', 'Not listed')}
        </RequirementRow>
        <RequirementRow label="Portfolio">
          {req?.info_flags?.portfolio_required
            ? <Known course={course} value="Required" field="requirement.portfolio" label="Portfolio requirement" />
            : gap('requirement.portfolio', 'Portfolio requirement', 'Not listed')}
        </RequirementRow>
        <RequirementRow label="Minimum age">
          {show(
            req?.info_flags?.min_age != null ? `${req.info_flags.min_age} years` : null,
            'requirement.min_age',
            'Minimum age',
            'None listed',
          )}
        </RequirementRow>
      </dl>
    </Section>
  )

  const prose = (
    <div className="grid grid-cols-1 gap-md md:grid-cols-2">
      <Section title="Eligibility">
        <div className="text-body-sm text-text-secondary">
          {course.eligibility ? course.eligibility : gap('eligibility', 'Eligibility')}
        </div>
      </Section>
      <Section title="Benefits">
        <div className="text-body-sm text-text-secondary">
          {course.benefits ? course.benefits : gap('benefits', 'Benefits')}
        </div>
      </Section>
    </div>
  )

  return (
    <Modal onClose={onClose} title={course.name} header={header} widthRem={56} dismissible>
      <div className="flex flex-col gap-md">
        {gaps.length > 0 && (
          <p className="rounded-md bg-info/10 px-md py-sm text-body-sm text-text-primary">
            {gaps.length} {gaps.length === 1 ? 'detail is' : 'details are'} missing for this course. Use{' '}
            <span className="font-medium text-primary">+ Add</span> next to any of them to suggest the value — a
            Platform Admin reviews it before students see it.
          </p>
        )}
        {about}
        {keyDetails}
        {intakes}
        {requirements}
        {prose}
      </div>
    </Modal>
  )
}

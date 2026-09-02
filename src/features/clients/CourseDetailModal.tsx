import { Modal } from '@/components/Modal'
import { Badge } from '@/components/Badge'
import { SuggestCorrectionButton } from '@/features/clients/SuggestCorrectionButton'
import { useExams } from '@/queries/catalogSettings'
import { formatCourseFee } from '@/lib/money'
import type { components } from '@/api/schema'

type Course = components['schemas']['Course']

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-start justify-between gap-md">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-right text-text-primary">{value}</dd>
    </div>
  )
}

// Every "suggest a correction" pencil on a course now lives HERE, on the one popup that already
// shows every fact about it, instead of scattered across whichever columns the results table
// happens to render (user, 2026-08-24: "what about fields that are not there in the table view...
// edit option for fields in popup and remove it from table view"). That also lifts a real
// constraint the table version had: Entry Requirements' pencils used to live inside Grade Match,
// which only renders once an applicant is selected — but a requirement is the COLLEGE's own
// published fact, unrelated to any one applicant, so there was never a reason correcting it
// needed a person picked first. It doesn't anymore.
function correctable(course: Course, value: string | null | undefined, field: string, label: string, numeric = false) {
  if (!value) return null
  return (
    <span className="group inline-flex items-center gap-0.5">
      {value}
      <SuggestCorrectionButton courseId={course.id} field={field} label={label} current={value} numeric={numeric} />
    </span>
  )
}

/**
 * The whole COURSE — the sibling of {@link CollegeDetailModal} the user asked for next
 * (2026-08-24: "what if i want to see all course details... we need course details too"). Every
 * factual field carries its own "suggest a correction" pencil via `correctable()` above — moved
 * here from the results table (2026-08-24: "edit option for fields in popup and remove it from
 * table view") so a field the table never showed a column for is still correctable, not just the
 * two or three that happened to have one. Prose fields (description, benefits, eligibility) stay
 * plain text, same original reasoning as `SuggestCorrectionButton` itself: a wrong fee misleads a
 * student, "this could be phrased better" is a different kind of feedback.
 *
 * Unlike the college popup this needs no fetch — the row already IS a full `Course` object
 * (Course Finder's `/courses` call returns every field on every row; the table just doesn't
 * render all of them), so this is pure display over data the caller already has in hand.
 */
export function CourseDetailModal({ course, onClose }: { course: Course; onClose: () => void }) {
  const exams = useExams()
  const examName = (examId: string) => exams.data?.find((e) => e.id === examId)?.name ?? examId

  const req = course.requirements
  const fee = course.fee?.amount != null ? formatCourseFee(course.fee, course.fee_period) : null
  const appFee = course.application_fee?.amount != null ? formatCourseFee(course.application_fee, null) : null

  return (
    <Modal onClose={onClose} title={course.name} widthRem={34}>
      <div className="flex flex-col gap-md">
        <div className="flex flex-wrap items-center gap-xs">
          {course.level && (
            <Badge color="primary" className="capitalize">
              {course.level}
            </Badge>
          )}
          {course.credentials && <Badge color="secondary">{course.credentials}</Badge>}
          {/* `active` and `visible` can disagree — a course can be individually active but still
              hidden because its COLLEGE is off (build reference 1.11's "college toggle is a pure
              visibility master switch"). Showing only `!active` would call this course fine when
              a student searching right now cannot actually find it. */}
          {!course.active ? (
            <Badge color="error">Inactive</Badge>
          ) : course.visible === false ? (
            <Badge color="warning">Hidden — college inactive</Badge>
          ) : null}
          {course.most_viewed && <Badge color="secondary">Most viewed</Badge>}
        </div>
        <p className="text-body-sm text-text-secondary">
          {course.college_name}
          {course.campus_city ? `, ${course.campus_city}` : ''}
          {course.country ? ` · ${course.country}` : ''}
        </p>
        {course.description && <p className="text-body-sm text-text-secondary">{course.description}</p>}

        <dl className="flex flex-col gap-xs text-body-sm">
          <Row
            label="Field of study"
            value={correctable(course, course.field_of_study, 'field_of_study', 'Field of study')}
          />
          <Row label="Duration" value={correctable(course, course.duration, 'duration', 'Duration')} />
          <Row label="Fee" value={correctable(course, fee, 'fee.amount', 'Fee', true)} />
          <Row
            label="Intakes"
            value={correctable(course, (course.intakes ?? []).join(', ') || null, 'intakes', 'Intakes')}
          />
          <Row label="Language" value={correctable(course, course.language, 'language', 'Language')} />
          <Row
            label="Study mode"
            value={correctable(course, course.study_mode?.replace('_', ' ') ?? null, 'study_mode', 'Study mode')}
          />
          <Row
            label="Delivery"
            value={correctable(course, course.delivery?.replace('_', ' ') ?? null, 'delivery', 'Delivery')}
          />
          <Row
            label="Co-op"
            value={correctable(
              course,
              course.coop_available ? 'Available' : null,
              'coop_available',
              'Co-op availability',
            )}
          />
          <Row
            label="Post-study work"
            value={correctable(
              course,
              course.post_study_work_eligible ? 'Eligible' : null,
              'post_study_work_eligible',
              'Post-study work eligibility',
            )}
          />
          <Row
            label="Scholarship"
            value={correctable(
              course,
              course.scholarship_available ? (course.scholarship_note ?? 'Available') : null,
              'scholarship_available',
              'Scholarship',
            )}
          />
          <Row
            label="Application fee"
            value={
              appFee && (
                <>
                  {correctable(course, appFee, 'application_fee.amount', 'Application fee', true)}
                  {course.application_fee_waived ? ' (waivable)' : ''}
                </>
              )
            }
          />
        </dl>

        {course.benefits && (
          <div className="flex flex-col gap-xs border-t border-border pt-sm">
            <span className="text-body-sm font-medium text-text-primary">Benefits</span>
            <p className="text-body-sm text-text-secondary">{course.benefits}</p>
          </div>
        )}

        {course.eligibility && (
          <div className="flex flex-col gap-xs border-t border-border pt-sm">
            <span className="text-body-sm font-medium text-text-primary">Eligibility</span>
            <p className="text-body-sm text-text-secondary">{course.eligibility}</p>
          </div>
        )}

        {course.intake_deadlines && course.intake_deadlines.length > 0 && (
          <div className="flex flex-col gap-xs border-t border-border pt-sm">
            <span className="text-body-sm font-medium text-text-primary">Intakes</span>
            <dl className="flex flex-col gap-xs text-body-sm">
              {course.intake_deadlines.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-md">
                  <dt className="text-text-secondary">
                    {d.month}
                    {d.status === 'closed' && (
                      <Badge color="secondary" className="ml-xs">
                        Closed
                      </Badge>
                    )}
                  </dt>
                  <dd className="text-text-primary">
                    {d.application_deadline ? `Apply by ${d.application_deadline}` : '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {req && (
          <div className="flex flex-col gap-xs border-t border-border pt-sm">
            <span className="text-body-sm font-medium text-text-primary">Entry requirements</span>
            <dl className="flex flex-col gap-xs text-body-sm">
              <Row
                label="Academic"
                value={correctable(
                  course,
                  req.academic?.min_score != null
                    ? `${req.academic.min_score}${req.academic.scheme === 'percentage' ? '%' : ''} min${
                        req.academic.max_backlogs != null ? ` · up to ${req.academic.max_backlogs} backlogs` : ''
                      }`
                    : null,
                  'requirement.academic',
                  'Academic requirement',
                )}
              />
              <Row
                label="Background"
                value={correctable(
                  course,
                  req.academic?.required_background,
                  'requirement.background',
                  'Required background',
                )}
              />
              {(req.english ?? []).map((e, i) => (
                <Row
                  key={i}
                  label={examName(e.exam_id)}
                  value={correctable(
                    course,
                    `${e.min_overall}${e.min_band != null ? ` (min ${e.min_band} per band)` : ''}`,
                    `requirement.english.${examName(e.exam_id)}`,
                    `${examName(e.exam_id)} requirement`,
                  )}
                />
              ))}
              <Row
                label="MOI accepted"
                value={correctable(course, req.moi_accepted ? 'Yes' : null, 'requirement.moi_accepted', 'MOI accepted')}
              />
              {(req.aptitude ?? []).map((a, i) => (
                <Row
                  key={i}
                  label={examName(a.exam_id)}
                  value={correctable(
                    course,
                    `${a.min_score}${a.required ? ' · required' : ' · optional'}`,
                    `requirement.aptitude.${examName(a.exam_id)}`,
                    `${examName(a.exam_id)} requirement`,
                  )}
                />
              ))}
              <Row
                label="Work experience"
                value={correctable(
                  course,
                  req.min_work_experience_months ? `${req.min_work_experience_months} months min` : null,
                  'requirement.work_experience',
                  'Work experience requirement',
                )}
              />
              <Row
                label="Interview"
                value={correctable(
                  course,
                  req.info_flags?.interview_required ? 'Required' : null,
                  'requirement.interview',
                  'Interview requirement',
                )}
              />
              <Row
                label="Portfolio"
                value={correctable(
                  course,
                  req.info_flags?.portfolio_required ? 'Required' : null,
                  'requirement.portfolio',
                  'Portfolio requirement',
                )}
              />
            </dl>
          </div>
        )}
      </div>
    </Modal>
  )
}

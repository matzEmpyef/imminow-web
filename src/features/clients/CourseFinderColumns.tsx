import { ListChecks, ListPlus } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import type { TableColumn } from '@/components/Table'
import type { components } from '@/api/schema'
import { formatCourseFee } from '@/lib/money'
import type { SelectedPerson, ShortlistEntry } from './courseFinderState'

type Course = components['schemas']['Course']
type Fit = components['schemas']['CourseEligibility']

function formatFee(course: Course): string {
  return formatCourseFee(course.fee, course.fee_period)
}

function formatInrLakh(course: Course): string | null {
  if (course.fee_normalized_inr == null) return null
  if (course.fee?.currency === 'INR') return null
  return `≈ ₹${(course.fee_normalized_inr / 100000).toFixed(1)}L`
}

// The failed/borderline-rule detail line plan §4.1 asks for ("a red row reads 'IELTS band
// 5.5 < 6.0 required'") — worst rules first, pass rows omitted, so a consultant reads the gap
// without opening anything.
function failingRules(fit: Fit) {
  return (fit.rules ?? []).filter((r) => r.result === 'fail' || r.result === 'borderline')
}

// eslint-disable-next-line react/only-export-components -- this is a render-helper module (its export is a columns factory, not a component); losing HMR fast-refresh for the private FitCell is fine
function FitCell({ fit }: { fit: Fit | null | undefined }) {
  if (!fit) return <span className="text-body-sm text-text-secondary">No requirements published</span>
  const problems = failingRules(fit)
  const pending = fit.pending ?? []
  let badge
  if (fit.verdict === 'meets') {
    badge = <Badge color="success">{fit.provisional ? 'Provisionally meets' : 'Meets requirements'}</Badge>
  } else if (fit.verdict === 'borderline') {
    badge = <Badge color="warning">Borderline</Badge>
  } else if (fit.verdict === 'below') {
    badge = <Badge color="error">Below requirements</Badge>
  } else {
    badge = <Badge color="primary">Profile incomplete</Badge>
  }
  return (
    <div className="flex flex-col gap-1">
      <span>
        {badge}
        <span className="ml-xs text-caption text-text-secondary">
          {fit.checks_evaluated}/{fit.checks_total} checks
        </span>
      </span>
      {fit.verdict == null && pending.length > 0 && (
        <span className="text-caption text-text-secondary">Missing: {pending.join(', ')}</span>
      )}
      {problems.map((r, i) => (
        // Suggesting a fix for the requirement ITSELF (a college-published fact, not the
        // applicant's own score) now lives on the course's own detail popup, alongside every
        // other correctable fact about the course, rather than scattered across the table (user,
        // 2026-08-24: "What we need is edit option for fields in popup and remove it from table
        // view") — click the course name to open it.
        <span key={i} className="text-caption text-text-secondary">
          {r.label}: {r.yours ?? '—'} vs {r.requirement} required
        </span>
      ))}
      {fit.intake_note && <span className="text-caption text-warning">{fit.intake_note}</span>}
    </div>
  )
}

export interface CourseFinderColumnsArgs {
  canCheckFit: boolean
  selectedPerson: SelectedPerson
  shortlist: ShortlistEntry[]
  suggestedCourseIds: Set<string>
  suggestPending: boolean
  suggestingId: string | undefined
  onToggleShortlist: (course: Course) => void
  onSuggest: (course: { id: string; name: string }) => void
  onOpenCourse: (course: Course) => void
  onOpenCollege: (collegeId: string) => void
}

// The results table's column set, extracted from CourseFinderPage's body (it was 116 lines of a
// ~600-line component). Pure factory — every piece of state it reads arrives as an argument.
export function buildCourseFinderColumns({
  canCheckFit,
  selectedPerson,
  shortlist,
  suggestedCourseIds,
  suggestPending,
  suggestingId,
  onToggleShortlist,
  onSuggest,
  onOpenCourse,
  onOpenCollege,
}: CourseFinderColumnsArgs): TableColumn<Course>[] {
  return [
    {
      key: 'name',
      header: 'Course',
      render: (c) => (
        <div className="flex flex-col">
          {/* The whole COURSE, read-only, one click away (user, 2026-08-24: "we need course
              details too") — the sibling of the college popup below, same trigger convention: the
              name itself, not a separate icon. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpenCourse(c)
            }}
            className="text-left font-medium text-text-primary hover:underline"
          >
            {c.name}
          </button>
          <span className="text-caption text-text-secondary">
            {/* The whole college, read-only, one click away (user, 2026-08-23: "consultant should
                see the whole college detail. show details in popup") — this is the one place a
                college name appears on this page, so it is the natural target rather than adding
                a separate icon. */}
            {c.college_id ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenCollege(c.college_id!)
                }}
                className="text-primary hover:underline"
              >
                {c.college_name}
              </button>
            ) : (
              c.college_name
            )}
            {c.country ? ` · ${c.country}` : ''}
            {c.language ? ` · ${c.language}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'fee',
      header: 'Fee',
      render: (c) => (
        <div className="flex flex-col">
          <span>{formatFee(c)}</span>
          {formatInrLakh(c) && <span className="text-caption text-text-secondary">{formatInrLakh(c)}</span>}
        </div>
      ),
    },
    {
      key: 'intakes',
      header: 'Intakes',
      hideBelow: 'md',
      render: (c) => {
        const value = (c.intakes ?? []).length > 0 ? (c.intakes ?? []).join(', ') : null
        return <span>{value ?? '—'}</span>
      },
    },
    // Grade Match only exists relative to a PERSON WITH A PROFILE — see canCheckFit in the page.
    ...(canCheckFit ? [{ key: 'fit', header: 'Grade Match', render: (c: Course) => <FitCell fit={c.fit} /> }] : []),
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => {
        // Both actions write to a specific applicant — Suggest sends a message/creates a row
        // against their case, and the note-down list is cached per applicant. With none picked
        // they would either fail or silently not persist, so the cell is empty instead:
        // researching for a lead with nobody picked yet is a read-only activity.
        if (!selectedPerson) return null
        const shortlisted = shortlist.some((e) => e.course_id === c.id)
        return (
          <div className="flex items-center justify-end gap-sm">
            {/* "Shortlist" was the wrong word for this (user, 2026-08-24): it is a purely private,
                on-this-device note the CONSULTANT keeps for the call — renamed to "Note down" so
                what it actually is (a scratchpad, not a commitment) is obvious from the label. */}
            <button
              type="button"
              onClick={() => onToggleShortlist(c)}
              aria-label={shortlisted ? `Remove ${c.name} from notes` : `Note down ${c.name}`}
              title={shortlisted ? 'Remove from notes' : 'Note down'}
              className={`flex h-9 w-9 items-center justify-center rounded-md ${
                shortlisted
                  ? 'text-primary hover:bg-background'
                  : 'text-text-secondary hover:bg-background hover:text-text-primary'
              }`}
            >
              {shortlisted ? <ListChecks className="h-4 w-4" /> : <ListPlus className="h-4 w-4" />}
            </button>
            {suggestedCourseIds.has(c.id) ? (
              <Badge color="secondary">Suggested</Badge>
            ) : (
              <Button
                variant="secondary"
                onClick={() => onSuggest({ id: c.id, name: c.name })}
                loading={suggestPending && suggestingId === c.id}
              >
                Suggest
              </Button>
            )}
          </div>
        )
      },
    },
  ]
}

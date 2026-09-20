import { useMemo, useState, type FormEvent } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Modal } from '@/components/Modal'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { Table, type TableColumn } from '@/components/Table'
import { Skeleton } from '@/components/QueryState'
import { useCourseSuggestions, useSuggestNewCourse } from '@/queries/courseSuggestions'
import { usePartnerColleges } from '@/queries/partnerColleges'
import { useMyConsultancy } from '@/queries/consultancy'
import { useCourseLevels } from '@/queries/courseFinder'
import { formatDate } from '@/lib/time'
import { formatMoney } from '@/lib/money'
import { useLevelLadder, type LevelLadder } from '@/lib/studyLevels'
import { showToast } from '@/lib/toast'

const STATUS_COLOR = { pending: 'warning', approved: 'success', rejected: 'error' } as const
// The consultant only needs a binary answer — did the change happen or not (user, 2026-08-24:
// "for consultant status should be accepted the change"). Whether the admin applied it as
// submitted, applied an edited value, or is adding it a different way is admin-facing detail
// (visible on the review side's own detail popup); collapsing all three to one word here is
// deliberate, not a missed distinction.
const STATUS_LABEL = { pending: 'Pending', approved: 'Accepted', rejected: 'Rejected' } as const

type Suggestion = NonNullable<ReturnType<typeof useCourseSuggestions>['data']>[number]

// The history table only ever said "Correction" or "New course" — the consultant asked
// (2026-08-24) to see WHAT was suggested, not just that something was, without opening anything.
// Structured corrections (SuggestCorrectionButton's `{field, label, current, suggested, note}`
// shape, 2026-08-23) read as a sentence; the pre-2026-08-23 legacy shape and the New Course form
// have no `field`, so they fall back to listing whatever payload keys exist.
//
// LABELLED LINES, not a `key: value` dump (console review M7, 2026-09-13). The fallback branch
// printed the wire keys verbatim — "fee: 3350000 INR, note: ..." — so a consultant read a
// snake_case field name and an unformatted amount in the column meant to tell them, at a glance,
// what they had asked for.
interface SuggestionLine {
  label: string
  value: string
  /** A correction reads as "Fee → new value"; a plain fact reads as "College: name". */
  arrow?: boolean
}

function suggestionLines(s: Suggestion, ladder: LevelLadder): SuggestionLine[] {
  const payload = s.payload as Record<string, unknown>
  if (s.type === 'new') {
    return (
      [
        { label: 'College', value: asText(payload.college_name) },
        { label: 'Level', value: ladder.label(asText(payload.level)) },
        { label: 'Field of study', value: asText(payload.field_of_study) },
      ] satisfies SuggestionLine[]
    ).filter((line) => line.value)
  }
  if (typeof payload.field === 'string') {
    const lines: SuggestionLine[] = [
      {
        label: String(payload.label ?? humaniseKey(payload.field)),
        value: `${asText(payload.current) || '—'} → ${asText(payload.suggested) || '—'}`,
        arrow: false,
      },
    ]
    if (payload.note) lines.push({ label: 'Note', value: asText(payload.note) })
    return lines
  }
  // Legacy shape: the payload's own keys ARE the fields being corrected. `note` is prose about
  // the change rather than one of them, so it is labelled plainly and kept last.
  return Object.entries(payload)
    .filter(([, v]) => v != null && v !== '')
    .sort(([a], [b]) => Number(a === 'note') - Number(b === 'note'))
    .map(([key, value]) => ({
      label: humaniseKey(key),
      value: formatLegacyValue(value),
      arrow: key !== 'note',
    }))
}

function humaniseKey(key: string): string {
  const words = key.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function asText(v: unknown): string {
  return v == null ? '' : String(v)
}

// Legacy correction rows (pre-2026-08-23) sometimes carry a real Course field's own shape rather
// than a flat string — e.g. `fee: {amount, currency}` — which stringified as `[object Object]`
// (caught in verification, 2026-08-24). Money is the one nested shape actually seeded this way;
// anything else nested falls back to compact JSON rather than repeating the same bug for a shape
// nobody anticipated. Formatted through the shared money primitive since M7, so an INR figure
// groups the Indian way here exactly as it does everywhere else.
function formatLegacyValue(v: unknown): string {
  if (Array.isArray(v)) return v.map(formatLegacyValue).join(', ')
  if (v && typeof v === 'object') {
    const money = v as { amount?: number; currency?: string }
    if (money.amount != null) return formatMoney(money.currency, money.amount)
    return JSON.stringify(v)
  }
  return String(v)
}

function SuggestionSummary({ suggestion }: { suggestion: Suggestion }) {
  // Labels off the served ladder (assumptions audit M23, product owner 2026-09-19).
  const ladder = useLevelLadder()
  const lines = suggestionLines(suggestion, ladder)
  if (lines.length === 0) return <span className="text-text-secondary">—</span>
  return (
    <div className="flex flex-col">
      {lines.map((line) => (
        <span key={line.label} className="text-text-secondary">
          <span className="font-medium text-text-primary">{line.label}</span>
          {line.arrow ? ' → ' : ': '}
          {line.value}
        </span>
      ))}
    </div>
  )
}

// A popup, not an inline Card (user, 2026-08-24) — the platform-wide "add flows are popups, never
// inline forms" rule this page had drifted from being the one holdout on. College is now a
// dropdown over the consultancy's OWN partner colleges (`usePartnerColleges`, the same relation
// Partner Colleges/Course Finder's picker/commission all read) rather than free text — a
// consultant proposing a course for a college they have no working relation with was always a
// contradiction the free-text field let through silently; the dropdown makes it structurally
// impossible. Inactive relations are excluded — a lapsed partnership is not one to add courses to.
//
// For an INSTITUTE the college is not a choice at all (INSTITUTE_ACCOUNT_PLAN D7/D13,
// 2026-09-10): its partner colleges are itself, and the server fixes the catalogue to that one
// college regardless of what any request says. So the dropdown collapses to a stated fact — a
// control whose only option is already selected is worse than no control, since it invites a
// decision that does not exist.
function SuggestNewCourseModal({ onClose }: { onClose: () => void }) {
  const suggestNew = useSuggestNewCourse()
  const partners = usePartnerColleges()
  const myConsultancy = useMyConsultancy()
  const activeColleges = (partners.data ?? []).filter((p) => p.active !== false)
  const isInstitute = myConsultancy.data?.kind === 'institute'

  const [name, setName] = useState('')
  const [collegeId, setCollegeId] = useState('')
  const [level, setLevel] = useState('')
  const { data: courseLevels } = useCourseLevels()
  // The whole served ladder, plus whatever codes the catalogue already carries (assumptions audit
  // M23, product owner 2026-09-19). The hand-kept four this used to union in are gone; the served
  // table carries no "a course may be TAUGHT at this rung" flag, only "a course may REQUIRE it",
  // so every active rung is offered and the server is the one that validates the code.
  const ladder = useLevelLadder()
  const [fieldOfStudy, setFieldOfStudy] = useState('')

  // An institute has exactly one relation and it is itself, so there is nothing to pick.
  const selectedCollege = isInstitute ? activeColleges[0] : activeColleges.find((c) => c.id === collegeId)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name || !selectedCollege) return
    suggestNew.mutate(
      { name, college_name: selectedCollege.college_name, level, field_of_study: fieldOfStudy },
      {
        onSuccess: () => {
          showToast(`Course suggestion submitted for ${name}`)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Suggest a New Course"
      widthRem={28}
      footer={
        <div className="flex justify-end gap-sm">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="suggest-new-course"
            loading={suggestNew.isPending}
            disabled={!name || !selectedCollege}
          >
            Submit Suggestion
          </Button>
        </div>
      }
    >
      <form id="suggest-new-course" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Course name" value={name} onChange={(e) => setName(e.target.value)} required />
        {partners.isLoading ? (
          // Was the words "Loading your partner colleges…" sitting where the College field goes
          // (console review M5, 2026-09-13) — a field-shaped bar reads as a field still arriving.
          <Skeleton className="h-16 rounded-md" />
        ) : isInstitute ? (
          <div className="flex flex-col gap-xs">
            <p className="text-body-sm font-medium text-text-primary">College</p>
            <p className="text-body-sm text-text-secondary">
              {selectedCollege?.college_name ?? 'No college linked to this account yet.'}
            </p>
            {/* Says WHY there is nothing to pick (console review M15, 2026-09-13) — a stated
                fact where every other account gets a dropdown reads as a control that failed to
                load unless the reason is on screen. */}
            <p className="text-caption text-text-secondary">An institute suggests courses for its own college only.</p>
          </div>
        ) : activeColleges.length === 0 ? (
          <p className="text-body-sm text-error">
            No active partner colleges on file — add one under Partner Colleges before suggesting a course for it.
          </p>
        ) : (
          <SelectField
            label="College"
            id="new-course-college"
            value={collegeId}
            onChange={(e) => setCollegeId(e.target.value)}
            required
          >
            <option value="">Select…</option>
            {activeColleges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.college_name}
              </option>
            ))}
          </SelectField>
        )}
        {/*
          A picker, not free text (2026-09-07). An approved suggestion is copied straight into
          the catalogue, so "MSc" typed here used to become a course level the student app's
          filter — which offered a hardcoded, title-cased four — could never match. The server
          rejects unknown codes now; this picker is what stops a consultancy hitting that
          rejection in the first place. Sourced from the CATALOGUE's own levels since console
          review M14 (2026-09-13), the same list Course Finder's filter reads, so the two cannot
          offer different rungs for the same courses.
        */}
        <SelectField label="Level" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">Not set</option>
          {/* A NEW course may sit on a rung nothing in the catalogue uses yet (a first PhD), so this
              dialog offers the higher-education ladder plus whatever the catalogue already has —
              never the school grades. */}
          {[...new Set([...ladder.options.map((l) => l.code), ...(courseLevels ?? [])])].map((code) => (
            <option key={code} value={code}>
              {ladder.label(code)}
            </option>
          ))}
        </SelectField>
        <TextField label="Field of study" value={fieldOfStudy} onChange={(e) => setFieldOfStudy(e.target.value)} />
        {suggestNew.isError && <p className="text-body-sm text-error">{suggestNew.error.message}</p>}
      </form>
    </Modal>
  )
}

// Trimmed to a New Course popup plus its own history (user, 2026-08-24: "we need to see only the
// Submission History... let consultant give suggestions as well - like keep the form"). The old
// Catalog browser and its row-expand freeform correction box are gone — Course Finder's own
// "Suggest a correction" pencil (2026-08-23) covers that job, pre-filled with the actual current
// value and scoped to one field, which a bare "what's incorrect?" text box never was. Suggesting a
// course that does not exist YET has no equivalent anywhere else, so this one capability survives
// on its own rather than folding into that page.
export function CourseSuggestionsPage() {
  const suggestions = useCourseSuggestions()
  const [historySort, setHistorySort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [showNewCourse, setShowNewCourse] = useState(false)

  const historyRows = useMemo(() => {
    let items = suggestions.data ?? []
    if (historySort) {
      const dir = historySort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av = historySort.field === 'status' ? a.status : historySort.field === 'type' ? a.type : a.created_at
        const bv = historySort.field === 'status' ? b.status : historySort.field === 'type' ? b.type : b.created_at
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [suggestions.data, historySort])

  const historyColumns: TableColumn<Suggestion>[] = [
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      render: (s) => (
        <Badge color={s.type === 'new' ? 'primary' : s.college ? 'secondary' : 'info'}>
          {s.type === 'new' ? 'New course' : s.college ? 'College correction' : 'Correction'}
        </Badge>
      ),
    },
    {
      key: 'course',
      header: 'Course',
      render: (s) => (
        <span className="font-medium text-text-primary">
          {s.type === 'new' ? (s.payload as { name?: string }).name : (s.course?.name ?? s.college?.name ?? '—')}
        </span>
      ),
    },
    {
      key: 'change',
      header: 'What was suggested',
      render: (s) => <SuggestionSummary suggestion={s} />,
    },
    { key: 'created_at', header: 'Submitted', sortable: true, render: (s) => formatDate(s.created_at) },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (s) => <Badge color={STATUS_COLOR[s.status]}>{STATUS_LABEL[s.status]}</Badge>,
    },
  ]

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-h1 text-text-primary">Course Suggestions</h1>
          <Button onClick={() => setShowNewCourse(true)}>Suggest a New Course</Button>
        </div>

        {showNewCourse && <SuggestNewCourseModal onClose={() => setShowNewCourse(false)} />}

        <div>
          <h2 className="mb-sm text-h3 text-text-primary">Submission History</h2>
          <Table
            columns={historyColumns}
            rows={historyRows}
            rowKey={(s) => s.id}
            loading={suggestions.isLoading}
            error={suggestions.isError ? 'Could not load submissions.' : undefined}
            emptyMessage="No submissions yet. Suggest a new course or a correction above and follow its review here."
            sort={historySort}
            onSortChange={(field, direction) => setHistorySort({ field, direction })}
          />
        </div>
      </div>
    </AppShell>
  )
}

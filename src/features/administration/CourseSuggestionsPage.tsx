import { useMemo, useState, type FormEvent } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Modal } from '@/components/Modal'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { Table, type TableColumn } from '@/components/Table'
import { useCourseSuggestions, useSuggestNewCourse } from '@/queries/courseSuggestions'
import { usePartnerColleges } from '@/queries/partnerColleges'
import { formatDate } from '@/lib/time'

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
function summarizeSuggestion(s: Suggestion): string {
  const payload = s.payload as Record<string, unknown>
  if (s.type === 'new') {
    return [payload.college_name, payload.level, payload.field_of_study].filter(Boolean).join(' · ') || '—'
  }
  if (typeof payload.field === 'string') {
    return `${payload.label ?? payload.field}: ${payload.current ?? '—'} → ${payload.suggested ?? '—'}`
  }
  const entries = Object.entries(payload).filter(([, v]) => v != null && v !== '')
  return entries.length > 0 ? entries.map(([k, v]) => `${k}: ${formatLegacyValue(v)}`).join(', ') : '—'
}

// Legacy correction rows (pre-2026-08-23) sometimes carry a real Course field's own shape rather
// than a flat string — e.g. `fee: {amount, currency}` — which stringified as `[object Object]`
// (caught in verification, 2026-08-24). Money is the one nested shape actually seeded this way;
// anything else nested falls back to compact JSON rather than repeating the same bug for a shape
// nobody anticipated.
function formatLegacyValue(v: unknown): string {
  if (Array.isArray(v)) return v.map(formatLegacyValue).join(', ')
  if (v && typeof v === 'object') {
    const money = v as { amount?: number; currency?: string }
    if (money.amount != null) return `${money.amount}${money.currency ? ` ${money.currency}` : ''}`
    return JSON.stringify(v)
  }
  return String(v)
}

// A popup, not an inline Card (user, 2026-08-24) — the platform-wide "add flows are popups, never
// inline forms" rule this page had drifted from being the one holdout on. College is now a
// dropdown over the consultancy's OWN partner colleges (`usePartnerColleges`, the same relation
// Partner Colleges/Course Finder's picker/commission all read) rather than free text — a
// consultant proposing a course for a college they have no working relation with was always a
// contradiction the free-text field let through silently; the dropdown makes it structurally
// impossible. Inactive relations are excluded — a lapsed partnership is not one to add courses to.
function SuggestNewCourseModal({ onClose }: { onClose: () => void }) {
  const suggestNew = useSuggestNewCourse()
  const partners = usePartnerColleges()
  const activeColleges = (partners.data ?? []).filter((p) => p.active !== false)

  const [name, setName] = useState('')
  const [collegeId, setCollegeId] = useState('')
  const [level, setLevel] = useState('')
  const [fieldOfStudy, setFieldOfStudy] = useState('')

  const selectedCollege = activeColleges.find((c) => c.id === collegeId)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name || !selectedCollege) return
    suggestNew.mutate(
      { name, college_name: selectedCollege.college_name, level, field_of_study: fieldOfStudy },
      { onSuccess: onClose },
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
          <p className="text-body-sm text-text-secondary">Loading your partner colleges…</p>
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
        <TextField label="Level" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="e.g. masters" />
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
        <Badge color={s.type === 'new' ? 'primary' : 'info'}>{s.type === 'new' ? 'New course' : 'Correction'}</Badge>
      ),
    },
    {
      key: 'course',
      header: 'Course',
      render: (s) => (
        <span className="font-medium text-text-primary">
          {s.type === 'new' ? (s.payload as { name?: string }).name : (s.course?.name ?? '—')}
        </span>
      ),
    },
    {
      key: 'change',
      header: 'What was suggested',
      render: (s) => <span className="text-text-secondary">{summarizeSuggestion(s)}</span>,
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

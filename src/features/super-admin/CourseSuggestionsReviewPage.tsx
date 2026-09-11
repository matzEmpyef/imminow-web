import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Modal } from '@/components/Modal'
import { CompactSelect } from '@/components/CompactSelect'
import { SearchSelect } from '@/components/SearchSelect'
import { Table, type TableColumn } from '@/components/Table'
import { StopPropagation } from '@/components/StopPropagation'
import { useApproveCourseSuggestion, useModerationQueue, useRejectCourseSuggestion } from '@/queries/moderation'
import { useAdminColleges, useCollegeDetail } from '@/queries/adminColleges'
import { useStudyLevels } from '@/queries/studyLevels'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'
import { CourseFormModal } from './CollegeDetailPage'
import type { components } from '@/api/schema'

type CourseSuggestion = components['schemas']['CourseSuggestion']
type Course = components['schemas']['Course']
type Kind = 'new' | 'course_correction' | 'college_correction'
type Status = 'pending' | 'approved' | 'rejected'

const KIND_BADGE: Record<Kind, { label: string; color: 'primary' | 'info' | 'secondary' }> = {
  new: { label: 'New course', color: 'primary' },
  course_correction: { label: 'Course correction', color: 'info' },
  college_correction: { label: 'College correction', color: 'secondary' },
}

const RESOLUTION_LABEL: Record<string, string> = {
  created: 'Course created from this suggestion',
  as_suggested: 'Added as suggested',
  modified: 'Added with modification',
  manual: 'Accepted — to be added by hand',
}

// Readable names for an older-style correction's raw course keys, and a new suggestion's fields.
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  college_name: 'College',
  level: 'Level',
  field_of_study: 'Field of study',
  duration: 'Duration',
  duration_months: 'Duration (months)',
  description: 'Description',
  benefits: 'Benefits',
  eligibility: 'Eligibility',
  credentials: 'Credentials',
  language: 'Language',
  course_url: 'Course page',
  intakes: 'Intakes',
  fee_period: 'Fee period',
  study_mode: 'Study mode',
  delivery: 'Delivery',
}

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

function show(value: unknown): string {
  if (value == null || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') {
    const money = value as { amount?: number; currency?: string }
    if (money.amount != null) return `${money.currency ?? ''} ${money.amount}`.trim()
    return JSON.stringify(value)
  }
  return String(value)
}

function subjectName(s: CourseSuggestion): string {
  if (s.type === 'new') return (s.payload as { name?: string })?.name ?? 'New course'
  return s.course?.name ?? s.college?.name ?? '—'
}

function Row({ label, current, suggested }: { label: string; current?: string; suggested: string }) {
  return (
    <div className="grid grid-cols-3 gap-sm border-b border-border py-xs text-body-sm last:border-0">
      <dt className="text-text-secondary">{label}</dt>
      {current !== undefined ? (
        <dd className="text-text-secondary">{current}</dd>
      ) : (
        <dd className="text-text-secondary" aria-hidden="true" />
      )}
      <dd className="font-medium text-text-primary">{suggested}</dd>
    </div>
  )
}

// A new-course suggestion becomes a course through the ordinary Add Course form (2026-09-11), so it
// is checked like any other: pick the college if the suggestion did not name one, then complete
// and save the pre-filled form, and the suggestion is approved with the course that was created.
function CreateFromSuggestion({
  suggestion,
  onDone,
  onCancel,
}: {
  suggestion: CourseSuggestion
  onDone: (course: Course) => void
  onCancel: () => void
}) {
  const payload = (suggestion.payload ?? {}) as Partial<Course> & { college_id?: string }
  const [collegeId, setCollegeId] = useState(payload.college_id ?? '')
  const [collegeSearch, setCollegeSearch] = useState('')
  const colleges = useAdminColleges({ search: collegeSearch || undefined, limit: 50 })
  const college = useCollegeDetail(collegeId || undefined)

  if (collegeId && college.data) {
    return (
      <CourseFormModal
        college={college.data}
        prefill={{ ...payload, college_id: collegeId } as Partial<Course>}
        onClose={onCancel}
        onCreated={onDone}
      />
    )
  }

  return (
    <Modal
      onClose={onCancel}
      title="Which college is this course at?"
      widthRem={28}
      footer={
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      }
    >
      <div className="flex flex-col gap-sm">
        <p className="text-body-sm text-text-secondary">
          The suggestion did not name a college in the catalogue. Choose it, then complete the course.
        </p>
        <SearchSelect
          id="suggestion-college"
          label="College"
          required
          options={(colleges.data?.items ?? []).map((c) => ({ id: c.id!, label: c.name ?? '' }))}
          value={collegeId}
          onChange={(value) => {
            setCollegeId(value)
            setCollegeSearch('')
          }}
          placeholder={colleges.isLoading ? 'Loading colleges…' : 'Search the catalogue…'}
        />
        {collegeId && college.isLoading && <p className="text-caption text-text-secondary">Opening the form…</p>}
      </div>
    </Modal>
  )
}

// Four outcomes for a correction (user, 2026-08-24): Add, Add with modification, "I'll add
// manually", Reject. Add is offered only when the server says approving would write something
// (`applicable_fields`) — a Grade Match requirement or a college fact is always changed by hand.
function SuggestionDetailModal({ suggestion, onClose }: { suggestion: CourseSuggestion; onClose: () => void }) {
  const approve = useApproveCourseSuggestion()
  const reject = useRejectCourseSuggestion()
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
  const [creating, setCreating] = useState(false)
  const studyLevels = useStudyLevels()
  // A level is stored as its code ("masters"); show the label people know.
  const levelLabel = (code: unknown) =>
    studyLevels.data?.find((l) => l.code === code)?.label ?? show(code)

  const payload = (suggestion.payload ?? {}) as Record<string, unknown> & {
    field?: string
    label?: string
    current?: string
    suggested?: string
    note?: string
  }
  const kind = (suggestion.kind ?? 'new') as Kind
  const structured = suggestion.type === 'correction' && typeof payload.field === 'string'
  const applicable = suggestion.applicable_fields ?? []
  const [modifiedValue, setModifiedValue] = useState(payload.suggested ?? '')
  const pending = suggestion.status === 'pending'
  const course = suggestion.course as (Course & Record<string, unknown>) | null | undefined
  const openLink = course?.college_id
    ? { to: `/admin/colleges/${course.college_id}`, label: 'Open course' }
    : suggestion.college?.id
      ? { to: `/admin/colleges/${suggestion.college.id}`, label: 'Open college' }
      : null
  const legacyKeys = suggestion.type === 'correction' && !structured ? Object.keys(payload).filter((k) => k !== 'note') : []
  const newKeys = suggestion.type === 'new' ? Object.keys(payload).filter((k) => !['note', 'college_id', 'campus_ids'].includes(k)) : []

  if (creating) {
    return (
      <CreateFromSuggestion
        suggestion={suggestion}
        onCancel={() => setCreating(false)}
        onDone={(created) => approve.mutate({ id: suggestion.id!, courseId: created.id! }, { onSuccess: onClose })}
      />
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={subjectName(suggestion)}
      widthRem={36}
      footer={
        pending ? (
          <div className="flex flex-wrap items-center justify-end gap-sm">
            {(approve.isError || reject.isError) && (
              <p className="mr-auto self-center text-body-sm text-error">
                {approve.error?.message ?? reject.error?.message}
              </p>
            )}
            {showReject ? (
              <>
                <Button variant="secondary" onClick={() => setShowReject(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  loading={reject.isPending}
                  disabled={!reason.trim()}
                  onClick={() => reject.mutate({ id: suggestion.id!, reason: reason.trim() }, { onSuccess: onClose })}
                >
                  Confirm Reject
                </Button>
              </>
            ) : suggestion.type === 'new' ? (
              <>
                <Button variant="secondary" onClick={() => setShowReject(true)}>
                  Reject
                </Button>
                <Button loading={approve.isPending} onClick={() => setCreating(true)}>
                  Create course…
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setShowReject(true)}>
                  Reject
                </Button>
                <Button
                  variant="secondary"
                  loading={approve.isPending && approve.variables?.mode === 'manual'}
                  onClick={() => approve.mutate({ id: suggestion.id!, mode: 'manual' }, { onSuccess: onClose })}
                >
                  I&rsquo;ll add manually
                </Button>
                {applicable.length > 0 && structured && (
                  <Button
                    variant="secondary"
                    loading={approve.isPending && approve.variables?.mode === 'modified'}
                    disabled={!modifiedValue}
                    onClick={() =>
                      approve.mutate({ id: suggestion.id!, mode: 'modified', value: modifiedValue }, { onSuccess: onClose })
                    }
                  >
                    Add with modification
                  </Button>
                )}
                {applicable.length > 0 && (
                  <Button
                    loading={approve.isPending && approve.variables?.mode === 'as_suggested'}
                    onClick={() => approve.mutate({ id: suggestion.id!, mode: 'as_suggested' }, { onSuccess: onClose })}
                  >
                    Add
                  </Button>
                )}
              </>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-md">
        <div className="flex flex-wrap items-center gap-sm">
          <Badge color={KIND_BADGE[kind].color}>{KIND_BADGE[kind].label}</Badge>
          {suggestion.college_name && suggestion.kind !== 'college_correction' && (
            <span className="text-body-sm text-text-secondary">{suggestion.college_name}</span>
          )}
          {openLink && (
            <Link to={openLink.to} className="ml-auto text-body-sm text-primary hover:underline">
              {openLink.label}
            </Link>
          )}
        </div>
        <p className="text-caption text-text-secondary">
          Suggested by {suggestion.submitted_by_name ?? 'a staff member'} · {suggestion.consultancy_name} ·{' '}
          {formatDate(suggestion.created_at!)}
        </p>

        {/* Readable rows, never raw JSON (2026-09-11). */}
        {structured && (
          <dl className="flex flex-col">
            <div className="grid grid-cols-3 gap-sm pb-xs text-caption text-text-secondary">
              <span />
              <span>Now</span>
              <span>Suggested</span>
            </div>
            <Row label={payload.label ?? 'Field'} current={payload.current ?? '—'} suggested={payload.suggested ?? '—'} />
          </dl>
        )}
        {legacyKeys.length > 0 && (
          <dl className="flex flex-col">
            <div className="grid grid-cols-3 gap-sm pb-xs text-caption text-text-secondary">
              <span />
              <span>Now</span>
              <span>Suggested</span>
            </div>
            {legacyKeys.map((k) => (
              <Row key={k} label={fieldLabel(k)} current={show(course?.[k])} suggested={show(payload[k])} />
            ))}
          </dl>
        )}
        {newKeys.length > 0 && (
          <dl className="flex flex-col">
            {newKeys.map((k) => (
              <Row key={k} label={fieldLabel(k)} suggested={k === 'level' ? levelLabel(payload[k]) : show(payload[k])} />
            ))}
          </dl>
        )}
        {payload.note && <p className="text-body-sm text-text-secondary">&ldquo;{payload.note}&rdquo;</p>}

        {pending && suggestion.type === 'correction' && applicable.length === 0 && (
          <p className="rounded-md bg-warning/10 p-sm text-caption text-text-secondary">
            This can&rsquo;t be applied automatically — {openLink ? `use ${openLink.label}` : 'edit it directly'}, then
            choose &ldquo;I&rsquo;ll add manually&rdquo;.
          </p>
        )}
        {pending && structured && applicable.length > 0 && (
          <TextField label="Value to apply if modified" value={modifiedValue} onChange={(e) => setModifiedValue(e.target.value)} />
        )}
        {pending && suggestion.type === 'new' && (
          <p className="text-caption text-text-secondary">
            Create course opens the Add Course form filled from this suggestion, so it gets the same checks as any course.
          </p>
        )}

        {showReject && pending && (
          <TextField
            label="Reason for rejection"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Sent to the person who suggested it."
          />
        )}
        {suggestion.status === 'rejected' && suggestion.rejection_reason && (
          <p className="text-body-sm text-error">Rejected: {suggestion.rejection_reason}</p>
        )}
        {suggestion.status === 'approved' && suggestion.resolution && (
          <p className="text-body-sm text-success">{RESOLUTION_LABEL[suggestion.resolution] ?? 'Accepted'}</p>
        )}
        {!pending && suggestion.reviewed_at && (
          <p className="text-caption text-text-secondary">
            Reviewed by {suggestion.reviewed_by_name ?? 'the immiNow team'} on {formatDate(suggestion.reviewed_at)}
          </p>
        )}
      </div>
    </Modal>
  )
}

export function CourseSuggestionsReviewPage() {
  const [status, setStatus] = useState<Status>('pending')
  const [kind, setKind] = useState<'' | Kind>('')
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const paging = useCursorPagination()

  const queue = useModerationQueue(status, {
    search: search || undefined,
    kind: kind || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  const reviewingSuggestion = reviewingId ? queue.data?.items.find((s) => s.id === reviewingId) : undefined
  const counts = queue.data?.counts

  const columns: TableColumn<CourseSuggestion>[] = [
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      render: (s) => {
        const badge = KIND_BADGE[(s.kind ?? 'new') as Kind]
        return <Badge color={badge.color}>{badge.label}</Badge>
      },
    },
    {
      key: 'name',
      header: 'Course',
      render: (s) =>
        s.kind === 'college_correction' ? (
          <span className="text-text-secondary">—</span>
        ) : (
          <span className="font-medium text-text-primary">{subjectName(s)}</span>
        ),
    },
    {
      key: 'college_name',
      header: 'College',
      sortable: true,
      render: (s) => s.college_name ?? <span className="text-text-secondary">Not given</span>,
    },
    {
      // Who, not just which account (2026-09-11) — an institute is an account too.
      key: 'consultancy_name',
      header: 'Suggested by',
      sortable: true,
      hideBelow: 'md',
      render: (s) => (
        <div className="flex flex-col">
          <span className="text-body-sm text-text-primary">{s.submitted_by_name ?? 'Staff member'}</span>
          <span className="text-caption text-text-secondary">{s.consultancy_name}</span>
        </div>
      ),
    },
    {
      key: status === 'pending' ? 'created_at' : 'reviewed_at',
      header: status === 'pending' ? 'Submitted' : 'Reviewed',
      sortable: true,
      render: (s) =>
        status === 'pending' ? (
          formatDate(s.created_at!)
        ) : (
          <div className="flex flex-col">
            <span className="text-body-sm text-text-primary">{s.reviewed_at ? formatDate(s.reviewed_at) : '—'}</span>
            {s.reviewed_by_name && <span className="text-caption text-text-secondary">by {s.reviewed_by_name}</span>}
          </div>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => (
        <StopPropagation className="flex justify-end">
          <button
            type="button"
            onClick={() => setReviewingId(s.id!)}
            aria-label={`Review ${subjectName(s)}`}
            title="Review"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Eye className="h-4 w-4" />
          </button>
        </StopPropagation>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Course Suggestions Review</h1>
          <p className="text-body-sm text-text-secondary">
            New courses and corrections suggested by consultancy and institute staff. Whoever suggested it is told the
            outcome.
          </p>
        </div>

        <div className="flex gap-xs">
          {(['pending', 'approved', 'rejected'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStatus(s)
                paging.reset()
              }}
              className={`rounded-full px-md py-xs text-body-sm capitalize ${
                status === s ? 'bg-primary/10 font-medium text-primary' : 'text-text-secondary hover:bg-background'
              }`}
            >
              {s}
              {counts ? ` (${counts[s]})` : ''}
            </button>
          ))}
        </div>

        <Table
          columns={columns}
          rows={queue.data?.items ?? []}
          rowKey={(s) => s.id!}
          loading={queue.isLoading}
          error={queue.isError ? 'Could not load course suggestions.' : undefined}
          emptyMessage={
            search || kind
              ? 'No suggestions match these filters.'
              : status === 'pending'
                ? "Nothing waiting for review. Consultancies' suggested courses and corrections appear here."
                : `No ${status} suggestions yet.`
          }
          sort={sort}
          onSortChange={(field, direction) => {
            setSort({ field, direction })
            paging.reset()
          }}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              paging.reset()
            },
            placeholder: 'Search course, college or consultancy…',
          }}
          filters={
            <CompactSelect
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as '' | Kind)
                paging.reset()
              }}
              label="Type"
            >
              <option value="">Any type</option>
              <option value="new">New course</option>
              <option value="course_correction">Course correction</option>
              <option value="college_correction">College correction</option>
            </CompactSelect>
          }
          pagination={{
            hasNext: Boolean(queue.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => queue.data?.meta.next_cursor && paging.next(queue.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: queue.data?.meta.total,
          }}
          onRowClick={(s) => setReviewingId(s.id!)}
        />

        {reviewingSuggestion && (
          <SuggestionDetailModal suggestion={reviewingSuggestion} onClose={() => setReviewingId(null)} />
        )}
      </div>
    </AdminShell>
  )
}

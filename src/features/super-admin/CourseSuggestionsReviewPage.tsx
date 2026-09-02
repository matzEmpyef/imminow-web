import { useState } from 'react'
import { Eye } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { StopPropagation } from '@/components/StopPropagation'
import { useApproveCourseSuggestion, useModerationQueue, useRejectCourseSuggestion } from '@/queries/moderation'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'
import type { components } from '@/api/schema'

type CourseSuggestion = components['schemas']['CourseSuggestion']

// Fields where a submitted value round-trips safely enough to apply with one click — see the
// server's own AUTO_APPLICABLE_CORRECTION_FIELDS for the reasoning (mock-server/server.js). A
// Grade Match requirement is deliberately excluded: the label alone does not say which nested
// requirements slot it belongs to.
const AUTO_APPLICABLE_FIELDS = new Set(['fee.amount', 'intakes'])

const RESOLUTION_LABEL: Record<string, string> = {
  as_suggested: 'Added as suggested',
  modified: 'Added with modification',
  manual: 'Will be added manually',
}

// Converted from an expandable Table row to an icon+popup (user-requested, 2026-08-19 — "Course
// Suggestions Review - on popup approve or reject"), same convention every other list page's
// detail/edit view already uses this session.
//
// A correction gets FOUR outcomes, not one generic Approve (user, 2026-08-24: "it should be add,
// add with modification, I will add manually and reject"): Add applies the consultant's own
// value; Add with modification lets the admin edit it first; "I will add manually" records the
// suggestion as accepted without touching the course, for anything with no safe auto-apply path
// (a Grade Match requirement, or a pre-2026-08-23 correction with no structured `field`). Reject
// is unchanged. `type: new` keeps its own original single Approve/Reject — it has no modes, it
// either creates the course or it does not.
function SuggestionDetailModal({ suggestion, onClose }: { suggestion: CourseSuggestion; onClose: () => void }) {
  const approve = useApproveCourseSuggestion()
  const reject = useRejectCourseSuggestion()
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')

  const payload = suggestion.payload as {
    field?: string
    label?: string
    current?: string
    suggested?: string
    note?: string
  }
  const structured = suggestion.type === 'correction' && typeof payload?.field === 'string'
  const autoApplicable = structured && AUTO_APPLICABLE_FIELDS.has(payload.field!)
  const [modifiedValue, setModifiedValue] = useState(payload?.suggested ?? '')

  function handleReject() {
    if (!reason) return
    reject.mutate({ id: suggestion.id!, reason }, { onSuccess: () => onClose() })
  }

  function handleApprove(mode?: 'as_suggested' | 'modified' | 'manual', value?: string) {
    approve.mutate({ id: suggestion.id!, mode, value }, { onSuccess: () => onClose() })
  }

  const courseName =
    suggestion.type === 'new' ? (suggestion.payload as { name?: string })?.name : suggestion.course?.name

  return (
    <Modal
      onClose={onClose}
      title={courseName ?? 'Course Suggestion'}
      widthRem={34}
      footer={
        suggestion.status === 'pending' ? (
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
                <Button variant="destructive" loading={reject.isPending} disabled={!reason} onClick={handleReject}>
                  Confirm Reject
                </Button>
              </>
            ) : suggestion.type === 'new' ? (
              <>
                <Button variant="secondary" onClick={() => setShowReject(true)}>
                  Reject
                </Button>
                <Button loading={approve.isPending} onClick={() => handleApprove()}>
                  Approve (create course)
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
                  onClick={() => handleApprove('manual')}
                >
                  I&rsquo;ll add manually
                </Button>
                {autoApplicable && (
                  <>
                    <Button
                      variant="secondary"
                      loading={approve.isPending && approve.variables?.mode === 'modified'}
                      disabled={!modifiedValue}
                      onClick={() => handleApprove('modified', modifiedValue)}
                    >
                      Add with modification
                    </Button>
                    <Button
                      loading={approve.isPending && approve.variables?.mode === 'as_suggested'}
                      onClick={() => handleApprove('as_suggested')}
                    >
                      Add
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-md">
        {suggestion.course && suggestion.type === 'correction' && (
          <p className="text-caption text-text-secondary">{suggestion.course.college_name}</p>
        )}

        {structured ? (
          <div className="flex flex-col gap-sm">
            <dl className="flex flex-col gap-xs text-body-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">{payload.label ?? 'Field'}</dt>
                <dd className="text-text-primary">{payload.current ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Suggested</dt>
                <dd className="font-medium text-text-primary">{payload.suggested ?? '—'}</dd>
              </div>
            </dl>
            {payload.note && <p className="text-body-sm text-text-secondary">&ldquo;{payload.note}&rdquo;</p>}
            {suggestion.status === 'pending' && !autoApplicable && (
              <p className="rounded-md bg-warning/10 p-sm text-caption text-text-secondary">
                This kind of change can&rsquo;t be applied automatically — review the note above and edit the course
                directly if it&rsquo;s valid.
              </p>
            )}
            {suggestion.status === 'pending' && autoApplicable && (
              <TextField
                label="Value to apply if modified"
                value={modifiedValue}
                onChange={(e) => setModifiedValue(e.target.value)}
              />
            )}
          </div>
        ) : (
          <pre className="overflow-x-auto rounded-md bg-surface p-sm text-caption text-text-secondary">
            {JSON.stringify(suggestion.payload, null, 2)}
          </pre>
        )}

        {showReject && suggestion.status === 'pending' && (
          <TextField label="Reason for rejection" required value={reason} onChange={(e) => setReason(e.target.value)} />
        )}
        {suggestion.status === 'rejected' && suggestion.rejection_reason && (
          <p className="text-body-sm text-error">Rejected: {suggestion.rejection_reason}</p>
        )}
        {suggestion.status === 'approved' && suggestion.resolution && (
          <p className="text-body-sm text-success">{RESOLUTION_LABEL[suggestion.resolution] ?? 'Accepted'}</p>
        )}
      </div>
    </Modal>
  )
}

export function CourseSuggestionsReviewPage() {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const paging = useCursorPagination()

  const queue = useModerationQueue(status, {
    search: search || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  const reviewingSuggestion = reviewingId ? queue.data?.items.find((s) => s.id === reviewingId) : undefined

  const columns: TableColumn<CourseSuggestion>[] = [
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      render: (s) => (
        <Badge color={s.type === 'new' ? 'primary' : 'info'}>{s.type === 'new' ? 'New Course' : 'Correction'}</Badge>
      ),
    },
    {
      key: 'name',
      header: 'Course',
      render: (s) => (
        <span className="font-medium text-text-primary">
          {s.type === 'new' ? (s.payload as { name?: string })?.name : s.course?.name}
        </span>
      ),
    },
    { key: 'consultancy_name', header: 'Consultancy', sortable: true, render: (s) => s.consultancy_name },
    { key: 'created_at', header: 'Submitted', sortable: true, render: (s) => formatDate(s.created_at!) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => (
        <StopPropagation className="flex justify-end">
          <button
            type="button"
            onClick={() => setReviewingId(s.id!)}
            aria-label={`Review ${s.type === 'new' ? (s.payload as { name?: string })?.name : s.course?.name}`}
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
            Combined queue of new-course suggestions and correction proposals, across every consultancy.
          </p>
        </div>

        <div className="flex gap-xs">
          {(['pending', 'approved', 'rejected'] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatus(s)
                paging.reset()
              }}
              className={`rounded-full px-md py-xs text-body-sm capitalize ${
                status === s ? 'bg-primary/10 font-medium text-primary' : 'text-text-secondary hover:bg-background'
              }`}
            >
              {s}
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
            search
              ? 'No suggestions match your search.'
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
            placeholder: 'Search consultancy…',
          }}
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

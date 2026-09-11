import { useState } from 'react'
import { Ban, Copy, Image, ListChecks, Pencil } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import { useAdminEvents, useVoidEvent } from '@/queries/eventsAdmin'
import { useCursorPagination } from '@/lib/pagination'
import { formatEventDateTime } from '@/lib/time'
import { showToast } from '@/lib/toast'
import { type Event } from './quizShared'
import { QuizSettingsModal } from './QuizSettingsModal'
import { ManageQuestionsModal } from './ManageQuestionsModal'
import { QuizParticipationCell } from './QuizLeaderboardModal'
import { QuizBrandingModal } from './QuizBrandingModal'
import { EventStatusBadge } from './EventStatusBadge'
import { EventDetailsModal } from './EventDetailsModal'
import { EventListingToggle } from './EventListingToggle'

// Row-level component so useVoidEvent() can be called at its own render top level — Table's
// `render: (row) => ...` runs as a callback, not a component body. User-requested (2026-08-15) —
// "Void quiz need confirmation," was firing directly off one click.
// Copy + 409 handling reworked (Marketing review, 2026-09-11): voiding now REVERSES every point
// the quiz paid (participation and position prizes) and notifies affected students — the old copy
// ("reverses any points already awarded... can't be undone") undersold what actually happens and
// gave no warning that students are told. Voiding an already-voided quiz now 409s
// (`locked_after_attempts`'s sibling, `already_voided`) rather than silently no-op'ing, so the
// server's own message is shown instead of a generic failure.
function VoidQuizAction({ event }: { event: Event }) {
  const voidEvent = useVoidEvent()
  const [confirming, setConfirming] = useState(false)

  if (event.status === 'voided') return null

  return (
    <div>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Void ${event.title}`}
        title="Void Quiz"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
      >
        <Ban className="h-4 w-4" />
      </button>
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Void Quiz"
          widthRem={24}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={voidEvent.isPending}
                onClick={() =>
                  voidEvent.mutate(event.id!, {
                    onSuccess: () => {
                      setConfirming(false)
                      showToast(`${event.title} voided`)
                    },
                  })
                }
              >
                Void
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Void <span className="font-medium text-text-primary">{event.title}</span>? It disappears from the app and
            every point it paid — participation and prizes — is taken back. Students are told.
          </p>
          {voidEvent.isError && <p className="mt-sm text-body-sm text-error">{voidEvent.error.message}</p>}
        </Modal>
      )}
    </div>
  )
}

export function QuizAdminPage() {
  const [showAdd, setShowAdd] = useState(false)
  const [managingId, setManagingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [brandingId, setBrandingId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  // Upcoming / Past tabs (2026-09-11) — same `when`/server-search/cursor-pagination contract every
  // other cursor-paginated admin list already uses (see ImminowUsersPage.tsx).
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming')
  const paging = useCursorPagination()

  function resetPaging() {
    paging.reset()
  }

  const events = useAdminEvents({
    type: 'quiz',
    when,
    search: search || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  const rows = events.data?.items ?? []
  const managingEvent = managingId ? rows.find((e) => e.id === managingId) : undefined
  const editingEvent = editingId ? rows.find((e) => e.id === editingId) : undefined
  const viewingEvent = viewingId ? rows.find((e) => e.id === viewingId) : undefined
  const duplicatingEvent = duplicatingId ? rows.find((e) => e.id === duplicatingId) : undefined
  const brandingEvent = brandingId ? rows.find((e) => e.id === brandingId) : undefined

  // Pool-count/per-attempt pills removed from the title (user-requested, 2026-08-17 — "avoid
  // showing question pool count and count per attempt in pill... we will need a popup to see all
  // the details anyway") — Manage Questions already shows the live pool count, and cramming both
  // numbers into the row as pills added noise without adding anything the popup doesn't already
  // say better. The participant count is a clickable link opening the leaderboard popup instead of
  // a bare number. Status column added (2026-09-11) — one server-computed status for every event
  // page (see EventStatusBadge); this used to show the raw `active` flag, which read "Active" weeks
  // after a quiz closed. Title now opens a READ-ONLY detail view (same click-title convention as
  // Webinar/Meeting) rather than jumping straight into the edit form — the Pencil icon edits.
  const columns: TableColumn<Event>[] = [
    {
      key: 'title',
      header: 'Quiz',
      sortable: true,
      render: (e) => (
        <button
          type="button"
          onClick={() => setViewingId(e.id!)}
          className="text-left font-medium text-text-primary hover:text-primary hover:underline"
        >
          {e.title}
        </button>
      ),
    },
    { key: 'status', header: 'Status', render: (e) => <EventStatusBadge status={e.status} /> },
    { key: 'starts_at', header: 'Starts', sortable: true, render: (e) => formatEventDateTime(e) },
    {
      key: 'ends_at',
      header: 'Ends',
      render: (e) => formatEventDateTime({ ...e, starts_at: e.ends_at, starts_at_local: e.ends_at_local }) || '—',
    },
    {
      key: 'attendance_count',
      header: 'Participation',
      align: 'right',
      render: (e) => <QuizParticipationCell event={e} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) => (
        <div className="flex justify-end gap-xs">
          <button
            type="button"
            onClick={() => setEditingId(e.id!)}
            aria-label={`Edit ${e.title}`}
            title="Edit"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setDuplicatingId(e.id!)}
            aria-label={`Duplicate ${e.title}`}
            title="Duplicate"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setManagingId(e.id!)}
            aria-label={`Manage questions for ${e.title}`}
            title="Manage Questions"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <ListChecks className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setBrandingId(e.id!)}
            aria-label={`Manage branding for ${e.title}`}
            title="Branding"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Image className="h-4 w-4" />
          </button>
          <EventListingToggle event={e} />
          <VoidQuizAction event={e} />
        </div>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Quiz</h1>
            <p className="text-body-sm text-text-secondary">Points-earning quizzes drawn from a question pool.</p>
          </div>
          <Button onClick={() => setShowAdd(true)}>Add Quiz</Button>
        </div>

        <div role="tablist" aria-label="Quiz" className="flex gap-lg border-b border-border">
          {(
            [
              { key: 'upcoming', label: 'Upcoming' },
              { key: 'past', label: 'Past' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={when === t.key}
              onClick={() => {
                setWhen(t.key)
                resetPaging()
              }}
              className={`-mb-px border-b-2 py-sm text-body-sm font-medium ${
                when === t.key ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {showAdd && (
          <QuizSettingsModal
            onClose={() => setShowAdd(false)}
            onCreated={(eventId) => {
              setShowAdd(false)
              setManagingId(eventId)
            }}
          />
        )}
        {editingEvent && <QuizSettingsModal editingEvent={editingEvent} onClose={() => setEditingId(null)} />}
        {duplicatingEvent && (
          <QuizSettingsModal
            duplicateFrom={duplicatingEvent}
            onClose={() => setDuplicatingId(null)}
            onCreated={(eventId) => {
              setDuplicatingId(null)
              setManagingId(eventId)
            }}
          />
        )}
        {viewingEvent && (
          <EventDetailsModal
            event={viewingEvent}
            onClose={() => setViewingId(null)}
            onEdit={() => {
              setViewingId(null)
              setEditingId(viewingEvent.id!)
            }}
          />
        )}
        {managingEvent && <ManageQuestionsModal event={managingEvent} onClose={() => setManagingId(null)} />}
        {brandingEvent && <QuizBrandingModal event={brandingEvent} onClose={() => setBrandingId(null)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id!}
          loading={events.isLoading}
          // T9 (third-pass review): a failed list fetch used to render "No quizzes yet."
          error={events.isError ? 'Could not load quizzes.' : undefined}
          emptyMessage={
            search
              ? 'No quizzes match your search.'
              : when === 'past'
                ? 'No past quizzes yet.'
                : 'No quizzes yet. Add one with Add Quiz above; it goes live once its question pool is full.'
          }
          sort={sort}
          onSortChange={(field, direction) => {
            setSort({ field, direction })
            resetPaging()
          }}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              resetPaging()
            },
            placeholder: 'Search title…',
          }}
          pagination={{
            hasNext: Boolean(events.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => events.data?.meta.next_cursor && paging.next(events.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: events.data?.meta.total,
          }}
        />
      </div>
    </AdminShell>
  )
}

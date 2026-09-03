import { useMemo, useState } from 'react'
import { Ban, Image, ListChecks } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import { useAdminEvents, useVoidEvent } from '@/queries/eventsAdmin'
import { formatDateTime, formatEventDateTime } from '@/lib/time'
import { type Event } from './quizShared'
import { QuizSettingsModal } from './QuizSettingsModal'
import { ManageQuestionsModal } from './ManageQuestionsModal'
import { QuizParticipationCell } from './QuizLeaderboardModal'
import { QuizBrandingModal } from './QuizBrandingModal'

// Row-level component so useVoidEvent() can be called at its own render top level — Table's
// `render: (row) => ...` runs as a callback, not a component body. User-requested (2026-08-15) —
// "Void quiz need confirmation," was firing directly off one click.
function VoidQuizAction({ event }: { event: Event }) {
  const voidEvent = useVoidEvent()
  const [confirming, setConfirming] = useState(false)

  if (event.voided) return null

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
                onClick={() => voidEvent.mutate(event.id!, { onSuccess: () => setConfirming(false) })}
              >
                Void
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Void <span className="font-medium text-text-primary">{event.title}</span>? This reverses any points already
            awarded for it and can't be undone.
          </p>
        </Modal>
      )}
    </div>
  )
}

export function QuizAdminPage() {
  const events = useAdminEvents('quiz')
  const [showAdd, setShowAdd] = useState(false)
  const [managingId, setManagingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [brandingId, setBrandingId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    let items = events.data?.items ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((e) => e.title?.toLowerCase().includes(q))
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av =
          sort.field === 'attendance_count'
            ? (a.attendance_count ?? 0)
            : sort.field === 'starts_at'
              ? (a.starts_at ?? '')
              : (a.title ?? '').toLowerCase()
        const bv =
          sort.field === 'attendance_count'
            ? (b.attendance_count ?? 0)
            : sort.field === 'starts_at'
              ? (b.starts_at ?? '')
              : (b.title ?? '').toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [events.data, search, sort])

  const managingEvent = managingId ? rows.find((e) => e.id === managingId) : undefined
  const editingEvent = editingId ? rows.find((e) => e.id === editingId) : undefined
  const brandingEvent = brandingId ? rows.find((e) => e.id === brandingId) : undefined

  // Pool-count/per-attempt pills removed from the title (user-requested, 2026-08-17 — "avoid
  // showing question pool count and count per attempt in pill... we will need a popup to see all
  // the details anyway") — Manage Questions already shows the live pool count, and cramming both
  // numbers into the row as pills added noise without adding anything the popup doesn't already
  // say better. Ends column added in their place; the participant count is now a clickable link
  // opening the new leaderboard popup instead of a bare number.
  const columns: TableColumn<Event>[] = [
    {
      key: 'title',
      header: 'Quiz',
      sortable: true,
      render: (e) => (
        <div className="flex items-center gap-sm">
          <button
            type="button"
            onClick={() => setEditingId(e.id!)}
            className="text-left font-medium text-text-primary hover:text-primary hover:underline"
          >
            {e.title}
          </button>
          {e.voided && <Badge color="error">Voided</Badge>}
          {!e.voided && <Badge color={e.active ? 'success' : 'secondary'}>{e.active ? 'Active' : 'Inactive'}</Badge>}
        </div>
      ),
    },
    { key: 'starts_at', header: 'Starts', sortable: true, render: (e) => formatEventDateTime(e) },
    { key: 'ends_at', header: 'Ends', render: (e) => (e.ends_at ? formatDateTime(e.ends_at) : '—') },
    {
      key: 'attendance_count',
      header: 'Participation',
      sortable: true,
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
        {managingEvent && <ManageQuestionsModal event={managingEvent} onClose={() => setManagingId(null)} />}
        {brandingEvent && <QuizBrandingModal event={brandingEvent} onClose={() => setBrandingId(null)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id!}
          loading={events.isLoading}
          // T9 (third-pass review): a failed list fetch used to render "No quizzes yet."
          error={events.isError ? 'Could not load quizzes.' : undefined}
          emptyMessage="No quizzes yet. Add one with Add Quiz above; it goes live once its question pool is full."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search title…' }}
        />
      </div>
    </AdminShell>
  )
}

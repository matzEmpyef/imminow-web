import { useState, type FormEvent } from 'react'
import { Copy, Pencil } from 'lucide-react'
import { EventListingToggle } from '@/features/super-admin/EventListingToggle'
import { AdminShell } from '@/features/auth/AdminShell'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { FieldLabel } from '@/components/FieldLabel'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import { EventStatusBadge } from '@/features/super-admin/EventStatusBadge'
import { EventAttendanceCell } from '@/features/super-admin/EventAttendanceCell'
import { EventDetailsModal } from '@/features/super-admin/EventDetailsModal'
import { useAdminEvents, useCreateEvent, useUpdateEvent } from '@/queries/eventsAdmin'
import { useCursorPagination } from '@/lib/pagination'
import { formatEventDateTime } from '@/lib/time'
import { EVENT_TIMEZONES, browserTimezone, utcIsoToWallClock, wallClockToUtcIso } from '@/lib/eventTimezones'
import type { components } from '@/api/schema'

type Event = components['schemas']['Event']
type MeetingPlatform = NonNullable<Event['meeting_platform']>

const MEETING_URL_PATTERN = /^https?:\/\/\S+$/i

// User-requested (2026-08-15) — "wherever there is add button, use popup, instead of inline
// form." "Ends at" is required (2026-08-15 follow-up, "we need end time, after that link should
// not redirect to meeting") — the field already existed on Event generically, just was never
// collected here; see build reference 1.13 for the Join-gating rule this enables.
// Combined Add/Edit (user-requested, 2026-08-16 — "we also need option to edit these details"),
// same editingEvent-prop pattern AddStepModal already uses: pre-fills and swaps the title/submit
// label instead of a separate Edit form to maintain. Capacity added the same follow-up ("we need
// max cap for webinars also") — the field already existed generically on Event/EventInput (used
// by Physical Meeting, and build reference 1.13 already documented capacity/waitlist as shared
// across all three event types), just was never collected here, same class of gap as end time.
// Sentpo Points added 2026-08-18 (user-requested — "give option to give custom Sentpo Points") —
// the generic points_override field, same one Quiz's "Participation points" already surfaces
// (build reference 1.8): a per-event override on top of the webinar_attended Earn Rule's own
// default point value, credited to every confirmed attendee.
// Meeting link made required (Marketing review, 2026-09-11) — a webinar without a working link
// recorded attendance and paid points for a Join that opened nothing; the server already rejects
// this with a 400, this just stops the round trip.
// `duplicateFrom` (2026-09-11) — the "Duplicate" row action opens this same modal prefilled from
// an existing webinar instead of blank, in CREATE mode (`isEditing` stays keyed on `editingEvent`
// alone). Dates come along with the copy rather than being cleared — the note below tells the
// admin to check them, same "keep them, but say so" choice build reference makes for all three
// event pages' Duplicate action.
function WebinarFormModal({
  editingEvent,
  duplicateFrom,
  onClose,
}: {
  editingEvent?: Event
  duplicateFrom?: Event
  onClose: () => void
}) {
  const isEditing = Boolean(editingEvent)
  const isDuplicating = !isEditing && Boolean(duplicateFrom)
  const source = editingEvent ?? duplicateFrom
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent(editingEvent?.id ?? '')
  const [title, setTitle] = useState(isDuplicating ? `${duplicateFrom?.title ?? ''} (copy)` : (source?.title ?? ''))
  const [description, setDescription] = useState(source?.description ?? '')
  // The zone the admin is TYPING IN, stated rather than assumed (2026-08-23). Physical Meetings
  // got this in Phase E; webinars were left marshalling through the browser's zone, which happens
  // to produce the right instant but never tells the admin which clock they are using — so an
  // admin abroad scheduling an India webinar had no way to check their own work.
  const [timezone, setTimezone] = useState(source?.timezone ?? browserTimezone())
  const [startsAt, setStartsAt] = useState(
    source?.starts_at ? utcIsoToWallClock(source.starts_at, source.timezone ?? browserTimezone()) : '',
  )
  const [endsAt, setEndsAt] = useState(
    source?.ends_at ? utcIsoToWallClock(source.ends_at, source.timezone ?? browserTimezone()) : '',
  )
  const [capacity, setCapacity] = useState(source?.capacity != null ? String(source.capacity) : '')
  const [meetingUrl, setMeetingUrl] = useState(source?.meeting_url ?? '')
  const [meetingPlatform, setMeetingPlatform] = useState<MeetingPlatform>(source?.meeting_platform ?? 'google_meet')
  const [pointsOverride, setPointsOverride] = useState(source?.points_override != null ? String(source.points_override) : '')

  const mutation = isEditing ? updateEvent : createEvent
  const meetingUrlValid = MEETING_URL_PATTERN.test(meetingUrl.trim())
  const canSubmit = Boolean(title) && Boolean(startsAt) && Boolean(endsAt) && meetingUrlValid

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const body = {
      title,
      description: description || null,
      starts_at: wallClockToUtcIso(startsAt, timezone),
      ends_at: wallClockToUtcIso(endsAt, timezone),
      timezone,
      capacity: capacity ? Number(capacity) : null,
      meeting_url: meetingUrl || null,
      meeting_platform: meetingPlatform,
      points_override: pointsOverride ? Number(pointsOverride) : null,
    }
    if (isEditing) {
      updateEvent.mutate(body, { onSuccess: () => onClose() })
    } else {
      createEvent.mutate({ type: 'webinar', ...body }, { onSuccess: () => onClose() })
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Webinar' : isDuplicating ? 'Duplicate Webinar' : 'Add Webinar'}
      widthRem={28}
      footer={
        <>
          {mutation.isError && <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>}
          <Button type="submit" form="webinar-form" loading={mutation.isPending} disabled={!canSubmit}>
            {isEditing ? 'Save Changes' : isDuplicating ? 'Create Copy' : 'Create Webinar'}
          </Button>
        </>
      }
    >
      <form id="webinar-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        {isDuplicating && (
          <p className="rounded-md border border-border bg-background p-sm text-caption text-text-secondary">
            Copied from <strong>{duplicateFrom?.title}</strong>, including its start/end window — check and update the
            dates below before saving.
          </p>
        )}
        <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex flex-col gap-xs">
          <FieldLabel htmlFor="webinar-description">Description</FieldLabel>
          <textarea
            id="webinar-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded-md border border-border bg-surface p-sm text-body text-text-primary"
          />
        </div>
        <div className="grid grid-cols-2 gap-sm">
          <TextField
            label="Starts at"
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <TextField
            label="Ends at"
            type="datetime-local"
            required
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
        <SelectField label="Time zone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {(EVENT_TIMEZONES as readonly string[]).includes(timezone) ? null : (
            <option value={timezone}>{timezone}</option>
          )}
          {EVENT_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </SelectField>
        <p className="mt-xs text-caption text-text-secondary">
          The zone you are entering these times in. Unlike a physical meeting, attendees see a webinar converted to
          their OWN local time — this only makes sure the instant is right.
        </p>
        <p className="-mt-sm text-caption text-text-secondary">
          Join only redirects to the meeting while this window is open.
        </p>
        <TextField
          label="Meeting URL"
          required
          placeholder="https://…"
          value={meetingUrl}
          onChange={(e) => setMeetingUrl(e.target.value)}
          error={meetingUrl && !meetingUrlValid ? 'Must start with http:// or https://.' : undefined}
        />
        <p className="-mt-sm text-caption text-text-secondary">
          Required — must start with http:// or https://. Students Join through this link while the window above is
          open.
        </p>
        <SelectField
          label="Platform"
          id="platform"
          value={meetingPlatform}
          onChange={(e) => setMeetingPlatform(e.target.value as MeetingPlatform)}
        >
          <option value="google_meet">Google Meet</option>
          <option value="zoom">Zoom</option>
          <option value="webex">Webex</option>
          <option value="teams">Teams</option>
          <option value="other">Other</option>
        </SelectField>
        <div className="grid grid-cols-2 gap-sm">
          <TextField label="Capacity" type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          <TextField
            label="Sentpo points"
            type="number"
            value={pointsOverride}
            onChange={(e) => setPointsOverride(e.target.value)}
          />
        </div>
        <p className="-mt-sm text-caption text-text-secondary">
          Overrides the default webinar_attended point value for attendees of this webinar.
        </p>
      </form>
    </Modal>
  )
}

export function WebinarsPage() {
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
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
    type: 'webinar',
    when,
    search: search || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  const rows = events.data?.items ?? []

  // Columns split out (user-requested, 2026-08-16 — "have separate col for type, status, end
  // time") from the old title-column-carries-everything layout. Status is last among the data
  // columns, before the icon-only Actions column — same "last col" placement the user asked for
  // on Physical Meetings below, applied here too for consistency between the two pages. Only
  // `starts_at`/`title` are sortable (2026-09-11, cursor pagination) — the server only sorts
  // /events by those two fields, so a "sort by RSVPs" that only reorders the current 20-row page
  // would be worse than no sort at all.
  const columns: TableColumn<Event>[] = [
    {
      key: 'title',
      header: 'Webinar',
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
    {
      key: 'meeting_platform',
      header: 'Type',
      render: (e) => (
        <Badge color="info" className="capitalize">
          {e.meeting_platform?.replace('_', ' ')}
        </Badge>
      ),
    },
    { key: 'starts_at', header: 'Starts', sortable: true, render: (e) => formatEventDateTime(e) },
    {
      key: 'ends_at',
      header: 'Ends',
      render: (e) => formatEventDateTime({ ...e, starts_at: e.ends_at, starts_at_local: e.ends_at_local }) || '—',
    },
    {
      key: 'capacity',
      header: 'Capacity',
      align: 'right',
      render: (e) => (
        <div className="flex flex-col items-end">
          <span>{e.capacity ? `${e.rsvp_count ?? 0} / ${e.capacity}` : '—'}</span>
          {(e.waitlist_count ?? 0) > 0 && (
            <span className="text-caption text-text-secondary">+{e.waitlist_count} waitlisted</span>
          )}
        </div>
      ),
    },
    {
      key: 'rsvp_count',
      header: 'Attendance',
      align: 'right',
      render: (e) => <EventAttendanceCell event={e} />,
    },
    { key: 'status', header: 'Status', render: (e) => <EventStatusBadge status={e.status} /> },
    {
      key: 'actions',
      header: '',
      render: (e) => (
        <div className="flex justify-end">
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
          <EventListingToggle event={e} />
        </div>
      ),
    },
  ]

  const editingEvent = editingId ? rows.find((e) => e.id === editingId) : undefined
  const viewingEvent = viewingId ? rows.find((e) => e.id === viewingId) : undefined
  const duplicatingEvent = duplicatingId ? rows.find((e) => e.id === duplicatingId) : undefined

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Webinars</h1>
            <p className="text-body-sm text-text-secondary">Online sessions with RSVP tracking.</p>
          </div>
          <Button onClick={() => setShowAdd(true)}>Add Webinar</Button>
        </div>

        <div role="tablist" aria-label="Webinars" className="flex gap-lg border-b border-border">
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

        {showAdd && <WebinarFormModal onClose={() => setShowAdd(false)} />}
        {editingEvent && <WebinarFormModal editingEvent={editingEvent} onClose={() => setEditingId(null)} />}
        {duplicatingEvent && <WebinarFormModal duplicateFrom={duplicatingEvent} onClose={() => setDuplicatingId(null)} />}
        {viewingEvent && <EventDetailsModal event={viewingEvent} onClose={() => setViewingId(null)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id!}
          loading={events.isLoading}
          error={events.isError ? 'Could not load webinars.' : undefined}
          emptyMessage={
            search
              ? 'No webinars match your search.'
              : when === 'past'
                ? 'No past webinars yet.'
                : 'No webinars yet. Add one with Add Webinar above; students see it under Events in the app.'
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

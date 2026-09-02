import { useMemo, useState, type FormEvent } from 'react'
import { Pencil } from 'lucide-react'
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
import { formatDateTime, formatEventDateTime } from '@/lib/time'
import { EVENT_TIMEZONES, browserTimezone, utcIsoToWallClock, wallClockToUtcIso } from '@/lib/eventTimezones'
import type { components } from '@/api/schema'

type Event = components['schemas']['Event']
type MeetingPlatform = NonNullable<Event['meeting_platform']>

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
function WebinarFormModal({ editingEvent, onClose }: { editingEvent?: Event; onClose: () => void }) {
  const isEditing = Boolean(editingEvent)
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent(editingEvent?.id ?? '')
  const [title, setTitle] = useState(editingEvent?.title ?? '')
  const [description, setDescription] = useState(editingEvent?.description ?? '')
  // The zone the admin is TYPING IN, stated rather than assumed (2026-08-23). Physical Meetings
  // got this in Phase E; webinars were left marshalling through the browser's zone, which happens
  // to produce the right instant but never tells the admin which clock they are using — so an
  // admin abroad scheduling an India webinar had no way to check their own work.
  const [timezone, setTimezone] = useState(editingEvent?.timezone ?? browserTimezone())
  const [startsAt, setStartsAt] = useState(
    editingEvent?.starts_at
      ? utcIsoToWallClock(editingEvent.starts_at, editingEvent.timezone ?? browserTimezone())
      : '',
  )
  const [endsAt, setEndsAt] = useState(
    editingEvent?.ends_at ? utcIsoToWallClock(editingEvent.ends_at, editingEvent.timezone ?? browserTimezone()) : '',
  )
  const [capacity, setCapacity] = useState(editingEvent?.capacity != null ? String(editingEvent.capacity) : '')
  const [meetingUrl, setMeetingUrl] = useState(editingEvent?.meeting_url ?? '')
  const [meetingPlatform, setMeetingPlatform] = useState<MeetingPlatform>(
    editingEvent?.meeting_platform ?? 'google_meet',
  )
  const [pointsOverride, setPointsOverride] = useState(
    editingEvent?.points_override != null ? String(editingEvent.points_override) : '',
  )

  const mutation = isEditing ? updateEvent : createEvent

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title || !startsAt || !endsAt) return
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
      title={isEditing ? 'Edit Webinar' : 'Add Webinar'}
      widthRem={28}
      footer={
        <>
          {mutation.isError && <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>}
          <Button
            type="submit"
            form="webinar-form"
            loading={mutation.isPending}
            disabled={!title || !startsAt || !endsAt}
          >
            {isEditing ? 'Save Changes' : 'Create Webinar'}
          </Button>
        </>
      }
    >
      <form id="webinar-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
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
        <TextField label="Meeting URL" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} />
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
  const events = useAdminEvents('webinar')
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
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
          sort.field === 'rsvp_count'
            ? (a.rsvp_count ?? 0)
            : sort.field === 'starts_at'
              ? (a.starts_at ?? '')
              : (a.title ?? '').toLowerCase()
        const bv =
          sort.field === 'rsvp_count'
            ? (b.rsvp_count ?? 0)
            : sort.field === 'starts_at'
              ? (b.starts_at ?? '')
              : (b.title ?? '').toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [events.data, search, sort])

  // Columns split out (user-requested, 2026-08-16 — "have separate col for type, status, end
  // time") from the old title-column-carries-everything layout. Status is last among the data
  // columns, before the icon-only Actions column — same "last col" placement the user asked for
  // on Physical Meetings below, applied here too for consistency between the two pages.
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
    { key: 'ends_at', header: 'Ends', render: (e) => (e.ends_at ? formatDateTime(e.ends_at) : '—') },
    {
      key: 'capacity',
      header: 'Capacity',
      align: 'right',
      render: (e) => (e.capacity ? `${e.rsvp_count ?? 0} / ${e.capacity}` : '—'),
    },
    {
      key: 'rsvp_count',
      header: 'Attendance',
      sortable: true,
      align: 'right',
      render: (e) => <EventAttendanceCell event={e} />,
    },
    { key: 'status', header: 'Status', render: (e) => <EventStatusBadge startsAt={e.starts_at} endsAt={e.ends_at} /> },
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
        </div>
      ),
    },
  ]

  const editingEvent = events.data?.items.find((e) => e.id === editingId)
  const viewingEvent = events.data?.items.find((e) => e.id === viewingId)

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

        {showAdd && <WebinarFormModal onClose={() => setShowAdd(false)} />}
        {editingEvent && <WebinarFormModal editingEvent={editingEvent} onClose={() => setEditingId(null)} />}
        {viewingEvent && <EventDetailsModal event={viewingEvent} onClose={() => setViewingId(null)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id!}
          loading={events.isLoading}
          error={events.isError ? 'Could not load webinars.' : undefined}
          emptyMessage="No webinars yet."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search title…' }}
        />
      </div>
    </AdminShell>
  )
}

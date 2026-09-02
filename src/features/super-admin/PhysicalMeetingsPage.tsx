import { useMemo, useState, type FormEvent } from 'react'
import { Pencil } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { FieldLabel } from '@/components/FieldLabel'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import { EventStatusBadge } from '@/features/super-admin/EventStatusBadge'
import { EventAttendanceCell } from '@/features/super-admin/EventAttendanceCell'
import { EventDetailsModal } from '@/features/super-admin/EventDetailsModal'
import { useAdminEvents, useCreateEvent, useUpdateEvent } from '@/queries/eventsAdmin'
import { formatEventDateTime } from '@/lib/time'
import { EVENT_TIMEZONES, browserTimezone, utcIsoToWallClock, wallClockToUtcIso } from '@/lib/eventTimezones'
import type { components } from '@/api/schema'
import { SelectField } from '@/components/SelectField'

type Event = components['schemas']['Event']

// User-requested (2026-08-15) — "wherever there is add button, use popup, instead of inline
// form." Was an inline Card that expanded below the page header; now a Modal, same fields.
// Combined Add/Edit (user-requested, 2026-08-16 — "we also need option to edit these details"),
// same editingEvent-prop pattern WebinarsPage's form uses.
// Sentpo Points added 2026-08-18 (user-requested — "give option to give custom Sentpo Points"),
// same points_override field/pattern as WebinarFormModal — overrides physical_meeting_attended's
// default point value for this specific meeting's attendees.
function MeetingFormModal({ editingEvent, onClose }: { editingEvent?: Event; onClose: () => void }) {
  const isEditing = Boolean(editingEvent)
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent(editingEvent?.id ?? '')
  const [title, setTitle] = useState(editingEvent?.title ?? '')
  const [description, setDescription] = useState(editingEvent?.description ?? '')
  // The venue's zone, not the admin's (Phase E, 2026-08-22). A meeting happens at a place, so
  // the clock typed below is that place's clock — and when EDITING we show it back in the venue's
  // zone rather than the editor's, or an admin abroad would see a time nobody will turn up at.
  const [timezone, setTimezone] = useState(editingEvent?.timezone ?? browserTimezone())
  const [startsAt, setStartsAt] = useState(
    editingEvent?.starts_at
      ? utcIsoToWallClock(editingEvent.starts_at, editingEvent.timezone ?? browserTimezone())
      : '',
  )
  const [venueAddress, setVenueAddress] = useState(editingEvent?.venue_address ?? '')
  const [venueCode, setVenueCode] = useState(editingEvent?.venue_code ?? '')
  const [capacity, setCapacity] = useState(editingEvent?.capacity != null ? String(editingEvent.capacity) : '')
  const [pointsOverride, setPointsOverride] = useState(
    editingEvent?.points_override != null ? String(editingEvent.points_override) : '',
  )

  const mutation = isEditing ? updateEvent : createEvent

  // The code freezes 3 hours before start — the exact moment attendees can begin entering it
  // (user-requested 2026-08-20, "admin should be able to decide what the key should be and edit
  // until 3 hours before meeting start"). Server enforces the same cutoff with a 400.
  const codeLocked = Boolean(
    isEditing &&
    editingEvent?.starts_at &&
    Date.now() >= new Date(editingEvent.starts_at).getTime() - 3 * 60 * 60 * 1000,
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title || !startsAt) return
    const body = {
      title,
      description: description || null,
      // Interpreted in the VENUE's zone, never the browser's — the bug this replaces.
      starts_at: wallClockToUtcIso(startsAt, timezone),
      timezone,
      venue_address: venueAddress || null,
      ...(codeLocked ? {} : { venue_code: venueCode.trim() || null }),
      capacity: capacity ? Number(capacity) : null,
      points_override: pointsOverride ? Number(pointsOverride) : null,
    }
    if (isEditing) {
      updateEvent.mutate(body, { onSuccess: () => onClose() })
    } else {
      createEvent.mutate({ type: 'physical_meeting', ...body }, { onSuccess: () => onClose() })
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Meeting' : 'Add Meeting'}
      widthRem={26}
      footer={
        <>
          {mutation.isError && <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>}
          <Button type="submit" form="meeting-form" loading={mutation.isPending} disabled={!title || !startsAt}>
            {isEditing ? 'Save Changes' : 'Create Meeting'}
          </Button>
        </>
      }
    >
      <form id="meeting-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex flex-col gap-xs">
          <FieldLabel htmlFor="meeting-description">Description</FieldLabel>
          <textarea
            id="meeting-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded-md border border-border bg-surface p-sm text-body text-text-primary"
          />
        </div>
        <TextField
          label="Starts at"
          type="datetime-local"
          required
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
        {/* The VENUE's zone, not the browser's. Attendees are shown this exact wall-clock time
            wherever they are reading from, so getting it wrong sends people to an empty hall. */}
        <SelectField label="Venue time zone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
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
          Attendees see this time on the venue&apos;s clock — it is never converted to theirs.
        </p>
        <TextField label="Venue address" value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} />
        <div>
          <TextField
            label="Attendance code"
            value={venueCode}
            onChange={(e) => setVenueCode(e.target.value.toUpperCase())}
            disabled={codeLocked}
            placeholder="Leave blank to auto-generate"
          />
          <p className="mt-xs text-caption text-text-secondary">
            {codeLocked
              ? 'Locked — the code can no longer change once attendees can start entering it (from 3 hours before start).'
              : 'Attendees type this code at the venue to record attendance. Editable until 3 hours before the meeting starts.'}
          </p>
        </div>
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
          Overrides the default physical_meeting_attended point value for attendees of this meeting.
        </p>
      </form>
    </Modal>
  )
}

export function PhysicalMeetingsPage() {
  const events = useAdminEvents('physical_meeting')
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    let items = events.data?.items ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((e) => e.title?.toLowerCase().includes(q) || e.venue_address?.toLowerCase().includes(q))
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

  // Venue code moved under the title as a caption (user-requested, 2026-08-16 — "show venue code
  // under meeting col"), replacing the old title-row Badge. Status is its own column, last among
  // the data columns before the icon-only Actions column (user-requested, "status as separate
  // col... last col").
  const columns: TableColumn<Event>[] = [
    {
      key: 'title',
      header: 'Meeting',
      sortable: true,
      render: (e) => (
        <div>
          <button
            type="button"
            onClick={() => setViewingId(e.id!)}
            className="text-left font-medium text-text-primary hover:text-primary hover:underline"
          >
            {e.title}
          </button>
          {e.venue_code && <p className="text-caption text-text-secondary">Code: {e.venue_code}</p>}
        </div>
      ),
    },
    { key: 'starts_at', header: 'Starts', sortable: true, render: (e) => formatEventDateTime(e) },
    { key: 'venue_address', header: 'Venue', render: (e) => e.venue_address },
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
            <h1 className="text-h1 text-text-primary">In-person Meetings</h1>
            <p className="text-body-sm text-text-secondary">
              In-person campus fairs and meetups. Attendance codes are self-entered by attendees on-site — set your own
              or leave blank to auto-generate; codes lock 3 hours before the meeting starts.
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)}>Add Meeting</Button>
        </div>

        {showAdd && <MeetingFormModal onClose={() => setShowAdd(false)} />}
        {editingEvent && <MeetingFormModal editingEvent={editingEvent} onClose={() => setEditingId(null)} />}
        {viewingEvent && <EventDetailsModal event={viewingEvent} onClose={() => setViewingId(null)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id!}
          loading={events.isLoading}
          error={events.isError ? 'Could not load in-person meetings.' : undefined}
          emptyMessage="No in-person meetings yet. Add one with Add Meeting above; students RSVP from the Events tab."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search title or venue…' }}
        />
      </div>
    </AdminShell>
  )
}

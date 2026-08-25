import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { EventStatusBadge } from './EventStatusBadge'
import { EventAttendanceCell } from './EventAttendanceCell'
import { formatEventDateTime } from '@/lib/time'
import type { components } from '@/api/schema'

type Event = components['schemas']['Event']

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-md">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd className="min-w-0 truncate text-right text-text-primary">{value}</dd>
    </div>
  )
}

// User-requested (2026-08-16) — "we should have a description for both webinar and physical
// meetings... click on the title.. popup appears with all details." Shared by Webinars and
// Physical Meetings — a read-only summary reachable by clicking the title, distinct from the
// pencil-icon Edit action, which opens the mutable form instead. Reuses EventAttendanceCell so
// the RSVP'd/Attended lists are reachable from here too, one place to see everything about an
// event without leaving this popup.
export function EventDetailsModal({ event, onClose }: { event: Event; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title={event.title ?? ''} widthRem={30}>
      <div className="flex flex-col gap-md">
        <EventStatusBadge startsAt={event.starts_at} endsAt={event.ends_at} />
        {event.description && <p className="text-body-sm text-text-secondary">{event.description}</p>}

        <dl className="flex flex-col gap-xs text-body-sm">
          <Row label="Starts" value={formatEventDateTime(event) || '—'} />
          <Row
            label="Ends"
            value={
              formatEventDateTime({
                ...event,
                starts_at: event.ends_at,
                starts_at_local: event.ends_at_local,
              }) || '—'
            }
          />
          {event.type === 'webinar' && (
            <>
              <Row
                label="Platform"
                value={<span className="capitalize">{event.meeting_platform?.replace('_', ' ')}</span>}
              />
              <Row
                label="Meeting URL"
                value={
                  event.meeting_url ? (
                    <a
                      href={event.meeting_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {event.meeting_url}
                    </a>
                  ) : (
                    '—'
                  )
                }
              />
            </>
          )}
          {event.type === 'physical_meeting' && (
            <>
              <Row label="Venue" value={event.venue_address || '—'} />
              <Row label="Venue code" value={event.venue_code || '—'} />
            </>
          )}
          <Row label="Capacity" value={event.capacity ? `${event.rsvp_count ?? 0} / ${event.capacity}` : 'No limit'} />
          {event.points_override != null && <Row label="Points override" value={event.points_override} />}
        </dl>

        <div className="flex items-center justify-between border-t border-border pt-sm">
          <span className="text-body-sm text-text-secondary">RSVPs &amp; Attendance</span>
          <EventAttendanceCell event={event} />
        </div>
      </div>
    </Modal>
  )
}

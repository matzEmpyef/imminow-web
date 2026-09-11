import type { ReactNode } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { EventStatusBadge } from './EventStatusBadge'
import { EventAttendanceCell } from './EventAttendanceCell'
import { QuizParticipationCell } from './QuizLeaderboardModal'
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
//
// Extended to Quiz (2026-09-11 — "clicking a quiz row opens a READ-ONLY detail view... with an
// Edit button — instead of jumping straight into the edit form"), which previously had no
// read-only view at all: clicking a quiz title opened QuizSettingsModal directly, mixing "look"
// and "change" into one popup the way Webinar/Meeting never did. `onEdit` is what makes that
// button appear — Webinar/Meeting don't pass it since they already have a separate pencil-icon
// Edit action outside this popup, so it stays exactly as it looked before for them.
export function EventDetailsModal({
  event,
  onClose,
  onEdit,
}: {
  event: Event
  onClose: () => void
  onEdit?: () => void
}) {
  return (
    <Modal
      onClose={onClose}
      title={event.title ?? ''}
      widthRem={30}
      dismissible
      footer={onEdit ? <Button onClick={onEdit}>Edit</Button> : undefined}
    >
      <div className="flex flex-col gap-md">
        <EventStatusBadge status={event.status} />
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
          {event.type === 'quiz' && (
            <>
              <Row label="Questions per attempt" value={event.questions_per_attempt ?? '—'} />
              <Row label="Time limit" value={event.time_limit_minutes ? `${event.time_limit_minutes} min` : 'No limit'} />
              <Row label="Question pool" value={`${event.questions?.length ?? 0} question(s)`} />
              <Row
                label="Position prizes"
                value={
                  event.position_prizes && event.position_prizes.length > 0
                    ? event.position_prizes
                        .map((p) => `#${p.position}${p.prize ? ` ${p.prize}` : ''}${p.points ? ` (+${p.points})` : ''}`)
                        .join(', ')
                    : 'None'
                }
              />
            </>
          )}
          {event.type !== 'quiz' && (
            <Row label="Capacity" value={event.capacity ? `${event.rsvp_count ?? 0} / ${event.capacity}` : 'No limit'} />
          )}
          {event.points_override != null && <Row label="Points override" value={event.points_override} />}
        </dl>

        {event.type === 'quiz' ? (
          <div className="flex items-center justify-between border-t border-border pt-sm">
            <span className="text-body-sm text-text-secondary">Participation</span>
            <QuizParticipationCell event={event} />
          </div>
        ) : (
          <div className="flex items-center justify-between border-t border-border pt-sm">
            <span className="text-body-sm text-text-secondary">RSVPs &amp; Attendance</span>
            <EventAttendanceCell event={event} />
          </div>
        )}
      </div>
    </Modal>
  )
}

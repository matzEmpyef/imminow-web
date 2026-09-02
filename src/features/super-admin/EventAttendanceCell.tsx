import { useState } from 'react'
import { PersonListModal } from './PersonListModal'
import { useEventAttendance } from '@/queries/eventsAdmin'
import { formatDateTime } from '@/lib/time'
import type { components } from '@/api/schema'

type Event = components['schemas']['Event']

// User-requested (2026-08-15) — "we need 2 list rsvp.ed and attended. on clicking the number we
// should see the list of rsvped and attended list." Shared by Webinars and Physical Meetings.
// The full lists are fetched lazily (only once a count is actually clicked, via `enabled`) rather
// than for every row on page load — the counts themselves already come from the list endpoint.
export function EventAttendanceCell({ event }: { event: Event }) {
  const [openList, setOpenList] = useState<'rsvp' | 'attendance' | null>(null)
  const attendance = useEventAttendance(openList ? event.id : undefined)

  return (
    <div className="flex items-center justify-end gap-md">
      <button type="button" onClick={() => setOpenList('rsvp')} className="text-body-sm text-primary hover:underline">
        {event.rsvp_count ?? 0} RSVP'd
      </button>
      <button
        type="button"
        onClick={() => setOpenList('attendance')}
        className="text-body-sm text-primary hover:underline"
      >
        {event.attendance_count ?? 0} Attended
      </button>

      {openList === 'rsvp' && (
        <PersonListModal
          title={`${event.title} — RSVPs`}
          rows={
            attendance.isLoading
              ? []
              : (attendance.data?.rsvps ?? []).map((r) => ({
                  name: r.student_name ?? '',
                  email: r.email ?? '',
                  studentType: r.student_type ?? 'aspirant',
                  updatedAt: r.created_at ? formatDateTime(r.created_at) : '',
                }))
          }
          emptyMessage={attendance.isLoading ? 'Loading…' : 'No RSVPs yet.'}
          onClose={() => setOpenList(null)}
        />
      )}
      {openList === 'attendance' && (
        <PersonListModal
          title={`${event.title} — Attended`}
          rows={
            attendance.isLoading
              ? []
              : (attendance.data?.attendance ?? []).map((a) => ({
                  name: a.student_name ?? '',
                  email: a.email ?? '',
                  studentType: a.student_type ?? 'aspirant',
                  updatedAt: a.verified_at ? formatDateTime(a.verified_at) : '',
                }))
          }
          emptyMessage={attendance.isLoading ? 'Loading…' : 'No attendance recorded yet.'}
          onClose={() => setOpenList(null)}
        />
      )}
    </div>
  )
}

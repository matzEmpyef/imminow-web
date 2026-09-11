import { useState } from 'react'
import { Download } from 'lucide-react'
import { PersonListModal } from './PersonListModal'
import { Button } from '@/components/Button'
import { useEventAttendance } from '@/queries/eventsAdmin'
import { formatDateTime } from '@/lib/time'
import type { components } from '@/api/schema'

type Event = components['schemas']['Event']
type EventAttendanceResponse = NonNullable<ReturnType<typeof useEventAttendance>['data']>

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

// One combined registrants export (2026-09-11 — "Download CSV" button, build reference: name,
// email, student type, status, registered at, attended yes/no) rather than two partial ones per
// popup — a waitlisted RSVP and whether that person actually showed up are both things an admin
// downloading "who registered" wants in the same row, not split across the RSVP'd and Attended
// lists separately.
function registrantsCsv(data: EventAttendanceResponse): string {
  const attendedEmails = new Set((data.attendance ?? []).map((a) => (a.email ?? '').toLowerCase()))
  const header = ['Name', 'Email', 'Student Type', 'Status', 'Registered At', 'Attended']
  const rows = (data.rsvps ?? []).map((r) => [
    r.student_name ?? '',
    r.email ?? '',
    r.student_type ?? '',
    r.status ?? '',
    r.created_at ?? '',
    attendedEmails.has((r.email ?? '').toLowerCase()) ? 'Yes' : 'No',
  ])
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n')
}

// Blob + object URL download (no server round trip needed — the data is already loaded for the
// popup it's downloaded from). Revoked right after the click so the URL doesn't linger.
function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function DownloadRegistrantsButton({ event, data }: { event: Event; data?: EventAttendanceResponse }) {
  if (!data) return null
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => downloadCsv(`${(event.title ?? 'event').replace(/[^\w\- ]+/g, '')}-registrants.csv`, registrantsCsv(data))}
    >
      <span className="flex items-center gap-xs">
        <Download className="h-4 w-4" />
        Download CSV
      </span>
    </Button>
  )
}

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
          intro={<DownloadRegistrantsButton event={event} data={attendance.data} />}
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
          intro={<DownloadRegistrantsButton event={event} data={attendance.data} />}
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

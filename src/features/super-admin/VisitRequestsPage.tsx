import { useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { useVisitRequests } from '@/queries/visitRequests'
import { formatDate, formatDateTime } from '@/lib/time'
import type { components } from '@/api/schema'

type VisitRequest = components['schemas']['VisitRequest']

const RESPONDED_FILTERS = [
  { value: null, label: 'All' },
  { value: false, label: 'Pending' },
  { value: true, label: 'Responded' },
] as const

// Support Tools' cross-consultancy view of in-person office visit requests (2026-08-24, user:
// "the purpose of this is super admin should be able to know possible in-person meeting...
// for super admin use a dedicated page"). Read-only, deliberately — there is no status to set
// here; "responded" is computed server-side from whether the consultancy side has replied in the
// actual chat thread, which is where the real conversation (confirming, countering a time,
// rescheduling) happens. This page exists purely so a platform admin doesn't have to go looking
// through every consultancy's chats to notice one came in.
export function VisitRequestsPage() {
  const [respondedFilter, setRespondedFilter] = useState<boolean | null>(false)
  const requests = useVisitRequests(respondedFilter)

  const columns: TableColumn<VisitRequest>[] = [
    {
      key: 'name',
      header: 'Applicant / Lead',
      render: (v) => (
        <div>
          <p className="font-medium text-text-primary">{v.context.name}</p>
          <p className="text-caption capitalize text-text-secondary">{v.context.kind}</p>
        </div>
      ),
    },
    { key: 'consultancy', header: 'Consultancy', render: (v) => v.consultancy_name },
    {
      key: 'proposed',
      header: 'Proposed',
      render: (v) => (
        <span className="text-text-primary">
          {formatDate(v.proposed_date)} at {v.proposed_time}
        </span>
      ),
    },
    {
      key: 'note',
      header: 'Note',
      render: (v) => (v.note ? <span className="line-clamp-sm max-w-[20rem] text-text-secondary">{v.note}</span> : '—'),
    },
    { key: 'created_at', header: 'Requested', render: (v) => formatDateTime(v.created_at) },
    {
      key: 'responded',
      header: 'Status',
      render: (v) => <Badge color={v.responded ? 'success' : 'warning'}>{v.responded ? 'Responded' : 'Pending'}</Badge>,
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Visit Requests</h1>
          <p className="text-body-sm text-text-secondary">
            In-person office visit requests students have sent through chat, across every consultancy. "Responded" means
            the consultancy has already replied in that conversation — the actual scheduling happens there, not on this
            page.
          </p>
        </div>

        <div className="flex gap-xs">
          {RESPONDED_FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setRespondedFilter(f.value)}
              className={`rounded-full px-3 py-1 text-body-sm ${
                respondedFilter === f.value
                  ? 'bg-primary text-white'
                  : 'bg-background text-text-secondary hover:text-text-primary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Table
          columns={columns}
          rows={requests.data?.items ?? []}
          rowKey={(v) => v.id}
          loading={requests.isLoading}
          error={requests.isError ? 'Could not load visit requests.' : undefined}
          emptyMessage={
            respondedFilter === false
              ? 'No pending visit requests.'
              : respondedFilter === true
                ? 'No responded visit requests yet.'
                : 'No visit requests yet.'
          }
        />
      </div>
    </AdminShell>
  )
}

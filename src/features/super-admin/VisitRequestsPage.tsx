import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { FilterChip } from '@/components/FilterChip'
import { Table, type TableColumn } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'
import { useVisitRequests, type VisitRequest } from '@/queries/visitRequests'
import { VisitRequestDrawer } from './visits/VisitRequestDrawer'
import { replyWaitingLabel, visitDateLabel } from './visits/format'

const STATUS_CHIPS = [
  { key: 'pending', label: 'Pending', responded: false },
  { key: 'replied', label: 'Replied', responded: true },
  { key: 'all', label: 'All', responded: undefined },
] as const

type StatusKey = (typeof STATUS_CHIPS)[number]['key']

/**
 * Support Tools' cross-consultancy view of in-person office visit requests (rebuilt 2026-09-12 on
 * the paged/search/summary/nudge contract). Students send these from chat; the consultancy
 * arranges the visit by replying in that same conversation, which is what "Replied" means here —
 * there is no status for this page to set, only a reminder it can send when nobody has answered.
 */
function isStatusKey(value: string | null): value is StatusKey {
  return STATUS_CHIPS.some((c) => c.key === value)
}

export function VisitRequestsPage() {
  const [searchParams] = useSearchParams()
  const [statusKey, setStatusKey] = useState<StatusKey>(() => {
    const fromUrl = searchParams.get('status')
    return isStatusKey(fromUrl) ? fromUrl : 'pending'
  })
  const [search, setSearch] = useState('')
  const paging = useCursorPagination()

  function resetPaging() {
    paging.reset()
  }

  const responded = STATUS_CHIPS.find((c) => c.key === statusKey)?.responded

  const requests = useVisitRequests({
    responded,
    search: search || undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  const rows = useMemo(() => requests.data?.items ?? [], [requests.data])
  const summary = requests.data?.summary
  const [viewing, setViewing] = useState<VisitRequest | null>(null)

  const chipCount = (key: StatusKey): number | undefined => {
    if (!summary) return undefined
    switch (key) {
      case 'pending':
        return summary.pending
      case 'replied':
        return summary.responded
      case 'all':
        return (summary.pending ?? 0) + (summary.responded ?? 0)
    }
  }

  const columns: TableColumn<VisitRequest>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (v) => (
        <div>
          <p className="font-medium text-text-primary">{v.context.name}</p>
          <Badge color="secondary" className="mt-0.5 capitalize">
            {v.context.kind}
          </Badge>
        </div>
      ),
    },
    { key: 'consultancy', header: 'Consultancy', hideBelow: 'md', render: (v) => v.consultancy_name },
    {
      key: 'proposed',
      header: 'Proposed',
      render: (v) => (
        <span className="whitespace-nowrap text-text-primary">
          {formatDate(v.proposed_date)} at {v.proposed_time}
        </span>
      ),
    },
    {
      // Two clocks, not one ambiguous "Waiting" (product review, 2026-09-12): a reply overdue by
      // days for a visit next week reads very differently from one replied to yesterday for a
      // visit tomorrow — the old single column could not tell them apart.
      key: 'reply_wait',
      header: 'Reply',
      hideBelow: 'sm',
      render: (v) => {
        const r = replyWaitingLabel(v.waiting_hours)
        return <span className={`whitespace-nowrap ${r.warn ? 'font-medium text-warning' : 'text-text-secondary'}`}>{r.text}</span>
      },
    },
    {
      key: 'visit_date',
      header: 'Visit',
      hideBelow: 'md',
      render: (v) => {
        const d = visitDateLabel(v.proposed_date)
        return <span className={`whitespace-nowrap ${d.warn ? 'font-medium text-warning' : 'text-text-secondary'}`}>{d.text}</span>
      },
    },
    {
      key: 'reminders',
      header: 'Reminders',
      align: 'right',
      hideBelow: 'lg',
      render: (v) => <span className="tabular-nums text-text-secondary">{v.nudge_count ? v.nudge_count : '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (v) => <Badge color={v.responded ? 'success' : 'warning'}>{v.responded ? 'Replied' : 'Pending'}</Badge>,
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Visit Requests</h1>
          <p className="text-body-sm text-text-secondary">
            Students' requests to visit a consultancy's office, sent from chat. The consultancy arranges it by
            replying in that same conversation — "Replied" means they have.
          </p>
        </div>

        <Table
          columns={columns}
          rows={rows}
          rowKey={(v) => v.id}
          loading={requests.isLoading}
          error={requests.isError ? 'Could not load visit requests.' : undefined}
          emptyMessage={
            statusKey === 'pending'
              ? 'No pending visit requests.'
              : statusKey === 'replied'
                ? 'No replied visit requests yet.'
                : 'No visit requests yet.'
          }
          onRowClick={(v) => setViewing(v)}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              resetPaging()
            },
            placeholder: 'Search student or consultancy…',
          }}
          quickFilters={
            <>
              {STATUS_CHIPS.map((chip) => {
                const count = chipCount(chip.key)
                return (
                  <FilterChip
                    key={chip.key}
                    label={count != null ? `${chip.label} (${count})` : chip.label}
                    active={statusKey === chip.key}
                    onChange={() => {
                      setStatusKey(chip.key)
                      resetPaging()
                    }}
                  />
                )
              })}
              {Boolean(summary?.pending_over_24h) && (
                <span className="text-caption font-medium text-warning">
                  {summary!.pending_over_24h} waiting over 24 hours
                </span>
              )}
            </>
          }
          pagination={{
            hasNext: Boolean(requests.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => requests.data?.meta.next_cursor && paging.next(requests.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: requests.data?.meta.total,
          }}
        />
      </div>

      {viewing && (
        <VisitRequestDrawer
          request={viewing}
          onClose={() => setViewing(null)}
          onUpdated={(updated) => setViewing(updated)}
        />
      )}
    </AdminShell>
  )
}

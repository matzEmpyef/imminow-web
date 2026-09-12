import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { FilterChip } from '@/components/FilterChip'
import { StopPropagation } from '@/components/StopPropagation'
import { Table, type TableColumn } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { useDisputes, type CaseDispute } from '@/queries/disputes'
import { DisputeDrawer } from './cases/DisputeDrawer'
import { DisputeResolveModal } from './cases/DisputeResolveModal'
import { DisputeSummaryTiles } from './cases/DisputeSummaryTiles'

const STATUS_CHIPS = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
] as const

type StatusKey = (typeof STATUS_CHIPS)[number]['key']

function isStatusKey(value: string | null): value is StatusKey {
  return STATUS_CHIPS.some((c) => c.key === value)
}

/**
 * The platform's dispute queue (rebuilt 2026-09-11 on the paged/notes/owner contract). A dispute
 * is not a way of closing a case — it is the state a case sits in WHILE the platform decides, so
 * this page is where every frozen case waits. Both sides land here: a consultancy raising an
 * issue, and (via the Complaints escalate flow) a student raising one.
 */
export function DisputesPage() {
  // Read once on mount (same convention as Finance Dashboard's ?rate=default) so a deep link —
  // Needs attention's "Open disputes" card, or Complaints' "Open in Disputes" for one escalated
  // from a student complaint — lands pre-filtered, or on the exact dispute via ?id=.
  const [searchParams, setSearchParams] = useSearchParams()
  const [statusKey, setStatusKey] = useState<StatusKey>(() => {
    const fromUrl = searchParams.get('status')
    return isStatusKey(fromUrl) ? fromUrl : 'open'
  })
  const [search, setSearch] = useState('')
  const paging = useCursorPagination()
  const openViaId = searchParams.get('id')

  function resetPaging() {
    paging.reset()
  }

  // A dispute reached via ?id= might be resolved, so widen to "all" rather than miss it under
  // whatever status the "open" default would otherwise apply.
  const effectiveStatus = openViaId ? 'all' : statusKey
  const disputes = useDisputes({ status: effectiveStatus, search: search || undefined, cursor: paging.cursor, limit: 20 })
  const rows = useMemo(() => disputes.data?.items ?? [], [disputes.data])
  const summary = disputes.data?.summary

  const [viewing, setViewing] = useState<CaseDispute | null>(null)
  const [resolving, setResolving] = useState<CaseDispute | null>(null)

  // Opens the drawer once the matching row has loaded, then drops ?id= so navigating away and back
  // (or Escape) doesn't keep reopening it.
  useEffect(() => {
    if (!openViaId || rows.length === 0) return
    const match = rows.find((d) => d.id === openViaId)
    if (match) {
      setViewing(match)
      const next = new URLSearchParams(searchParams)
      next.delete('id')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the target id or the loaded rows change
  }, [openViaId, rows])

  const columns: TableColumn<CaseDispute>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (d) => <span className="font-medium text-text-primary">{d.student_name}</span>,
    },
    {
      key: 'consultancy',
      header: 'Consultancy',
      hideBelow: 'md',
      render: (d) => d.consultancy_name ?? <span className="text-text-secondary">—</span>,
    },
    {
      key: 'raised_by',
      header: 'Raised by',
      hideBelow: 'lg',
      render: (d) =>
        d.raised_by === 'consultancy' ? (
          <span className="text-text-primary">Consultancy · {d.raised_by_name ?? '—'}</span>
        ) : (
          <span className="text-text-primary">Student (from a complaint)</span>
        ),
    },
    {
      key: 'paused',
      header: 'Paused',
      align: 'right',
      render: (d) => {
        // Same whole-day threshold as the "Paused 3+ days" tile, so the count and the highlighted
        // rows always agree.
        const days = d.paused_days ?? 0
        const warn = d.status === 'open' && days >= 3
        return (
          <span className={`whitespace-nowrap tabular-nums ${warn ? 'font-medium text-warning' : 'text-text-secondary'}`}>
            {days} {days === 1 ? 'day' : 'days'}
          </span>
        )
      },
    },
    {
      key: 'progress',
      header: 'Progress',
      hideBelow: 'lg',
      render: (d) => (
        <span className="whitespace-nowrap text-text-secondary">
          {d.case_progress?.plan_progress ? `${d.case_progress.plan_progress} steps done` : 'No plan'}
        </span>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      hideBelow: 'md',
      render: (d) =>
        d.assigned_to_name ? (
          <span className="text-text-primary">{d.assigned_to_name}</span>
        ) : (
          <span className="text-text-secondary">Unassigned</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) => <Badge color={d.status === 'open' ? 'warning' : 'success'}>{d.status === 'open' ? 'Open' : 'Resolved'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (d) =>
        d.status === 'open' ? (
          <StopPropagation>
            <Button size="sm" onClick={() => setResolving(d)}>
              Resolve
            </Button>
          </StopPropagation>
        ) : null,
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Disputes</h1>
          <p className="text-body-sm text-text-secondary">
            Cases paused while Sentpo decides. The plan and chat are frozen for both sides until you resolve one.
          </p>
        </div>

        <DisputeSummaryTiles summary={summary} loading={disputes.isLoading} />

        <Table
          columns={columns}
          rows={rows}
          rowKey={(d) => d.id}
          loading={disputes.isLoading}
          error={disputes.isError ? 'Could not load the dispute queue.' : undefined}
          emptyMessage="No case is waiting on a decision from Sentpo right now."
          onRowClick={(d) => setViewing(d)}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              resetPaging()
            },
            placeholder: 'Search student, consultancy or reason…',
          }}
          quickFilters={
            <>
              {STATUS_CHIPS.map((chip) => (
                <FilterChip
                  key={chip.key}
                  label={chip.label}
                  active={statusKey === chip.key}
                  onChange={() => {
                    setStatusKey(chip.key)
                    resetPaging()
                  }}
                />
              ))}
            </>
          }
          pagination={{
            hasNext: Boolean(disputes.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => disputes.data?.meta.next_cursor && paging.next(disputes.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: disputes.data?.meta.total,
          }}
        />
      </div>

      {viewing && (
        <DisputeDrawer dispute={viewing} onClose={() => setViewing(null)} onUpdated={(updated) => setViewing(updated)} />
      )}

      {resolving && (
        <DisputeResolveModal
          dispute={resolving}
          onClose={() => setResolving(null)}
          onResolved={(updated) => {
            setResolving(null)
            if (viewing && viewing.id === updated.id) setViewing(updated)
          }}
        />
      )}
    </AdminShell>
  )
}

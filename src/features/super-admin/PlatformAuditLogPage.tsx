import { useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { useAdminConsultancies } from '@/queries/adminConsultancies'
import { usePlatformAuditLog, type PlatformAuditLogFilters } from '@/queries/platformAuditLog'
import { useCursorPagination } from '@/lib/pagination'
import { formatDateTime } from '@/lib/time'

const ACTION_COLORS = { create: 'success', update: 'info', delete: 'error' } as const

type Entry = NonNullable<ReturnType<typeof usePlatformAuditLog>['data']>['items'][number]

export function PlatformAuditLogPage() {
  const consultancies = useAdminConsultancies()
  const [consultancyId, setConsultancyId] = useState('')
  const [actionType, setActionType] = useState<PlatformAuditLogFilters['action_type'] | ''>('')
  const [area, setArea] = useState<PlatformAuditLogFilters['area'] | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const paging = useCursorPagination()

  function resetPaging() {
    paging.reset()
  }

  const entries = usePlatformAuditLog({
    consultancy_id: consultancyId || undefined,
    action_type: actionType || undefined,
    area: area || undefined,
    from: from || undefined,
    to: to || undefined,
    search: search || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  const columns: TableColumn<Entry>[] = [
    {
      key: 'action_type',
      header: 'Action',
      sortable: true,
      render: (e) => <Badge color={ACTION_COLORS[e.action_type]}>{e.action_type}</Badge>,
    },
    {
      key: 'actor_name',
      header: 'User',
      sortable: true,
      render: (e) => <span className="font-medium text-text-primary">{e.actor_name ?? 'Unknown'}</span>,
    },
    {
      key: 'entity',
      header: 'Entity',
      render: (e) => (
        <span className="text-text-primary">
          {e.action_type}d {e.entity_type}
          {e.entity_label ? ` — ${e.entity_label}` : ''}
        </span>
      ),
    },
    {
      key: 'area',
      header: 'Area',
      sortable: true,
      render: (e) => (
        <span className="capitalize text-text-secondary">
          {e.area}
          {e.consultancy_id ? '' : ' · platform-level'}
        </span>
      ),
    },
    { key: 'created_at', header: 'When', sortable: true, render: (e) => formatDateTime(e.created_at) },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Audit Log</h1>
          <p className="text-body-sm text-text-secondary">
            Platform-wide — every change across every consultancy, gated to Platform Staff Administration.
          </p>
        </div>

        <Table
          columns={columns}
          rows={entries.data?.items ?? []}
          rowKey={(e) => e.id}
          loading={entries.isLoading}
          emptyMessage="No matching audit entries."
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
            placeholder: 'Search entity, reason, actor…',
          }}
          filters={
            <>
              <select
                value={consultancyId}
                onChange={(e) => {
                  setConsultancyId(e.target.value)
                  resetPaging()
                }}
                aria-label="Consultancy"
                className="h-10 rounded-md border border-border bg-background px-3 text-body-sm"
              >
                <option value="">Any (incl. platform-level)</option>
                {consultancies.data?.items?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={actionType}
                onChange={(e) => {
                  setActionType(e.target.value as PlatformAuditLogFilters['action_type'] | '')
                  resetPaging()
                }}
                aria-label="Action"
                className="h-10 rounded-md border border-border bg-background px-3 text-body-sm"
              >
                <option value="">Any action</option>
                <option value="create">Create</option>
                <option value="update">Update</option>
                <option value="delete">Delete</option>
              </select>
              <select
                value={area}
                onChange={(e) => {
                  setArea(e.target.value as PlatformAuditLogFilters['area'] | '')
                  resetPaging()
                }}
                aria-label="Area"
                className="h-10 rounded-md border border-border bg-background px-3 text-body-sm capitalize"
              >
                <option value="">Any area</option>
                {['leads', 'clients', 'plans', 'documents', 'settings', 'staff'].map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value)
                  resetPaging()
                }}
                aria-label="From"
                className="h-10 rounded-md border border-border bg-background px-3 text-body-sm"
              />
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value)
                  resetPaging()
                }}
                aria-label="To"
                className="h-10 rounded-md border border-border bg-background px-3 text-body-sm"
              />
            </>
          }
          pagination={{
            hasNext: Boolean(entries.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => entries.data?.meta.next_cursor && paging.next(entries.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: entries.data?.meta.total,
          }}
          expandable={{
            isExpanded: (e) => expandedId === e.id,
            renderExpanded: (e) => (
              <div className="flex flex-col gap-xs">
                {e.reason && (
                  <p className="text-body-sm text-text-primary">
                    <span className="font-medium">Reason:</span> {e.reason}
                  </p>
                )}
                {e.diff && (
                  <pre className="overflow-x-auto rounded-md bg-surface p-sm text-caption text-text-secondary">
                    {JSON.stringify(e.diff, null, 2)}
                  </pre>
                )}
                {!e.reason && !e.diff && (
                  <p className="text-body-sm text-text-secondary">No further detail recorded.</p>
                )}
              </div>
            ),
          }}
          onRowClick={(e) => setExpandedId((id) => (id === e.id ? null : e.id))}
        />
      </div>
    </AdminShell>
  )
}

import { auditActionLabel } from '@/lib/auditActions'
import { entityWord, entryTitle } from '@/lib/auditWords'
import { useState } from 'react'
import { AUDIT_SEARCH_HINT, AUDIT_SEARCH_PLACEHOLDER, AuditEntryDetail } from './AuditEntryDetail'
import { AuditDateRange, AuditWindowNote } from './AuditDateRange'
import { AppShell } from '@/features/auth/AppShell'
import { Badge } from '@/components/Badge'
import { Card } from '@/components/Card'
import { ApiError } from '@/api/errors'
import { Table, type TableColumn } from '@/components/Table'
import { CompactSelect } from '@/components/CompactSelect'
import { CONSULTANCY_AUDIT_AREAS, useAuditLog, type AuditLogFilters } from '@/queries/auditLog'
import { ServerSearchSelect } from '@/components/ServerSearchSelect'
import { anyEmployeeSource } from '@/queries/pickerSources'
import { useCursorPagination } from '@/lib/pagination'
import { formatDateTime } from '@/lib/time'
import { useAccountWords } from '@/lib/accountWords'
import { dateRangeError } from '@/lib/validation'

const ACTION_COLORS = { create: 'success', update: 'info', delete: 'error', view: 'secondary' } as const

// C1: action_type/entity_type/area are raw snake_case wire values ('kyc_verified',
// 'commission_entry', 'consultancy_management'…) — this reads them the same way the Action/Area
// filter dropdowns already spell their own options, rather than showing the wire value verbatim.
function labelize(value: string): string {
  return value
    .split('_')
    .map((word) => (word === 'kyc' ? 'KYC' : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

// An action with words of its own (`lib/auditActions.ts`) reads as those; every other one as above.
function actionLabel(action: string): string {
  return auditActionLabel(action) ?? labelize(action)
}

const AUDIT_PAGE_SIZE = 20

type Entry = NonNullable<ReturnType<typeof useAuditLog>['data']>['items'][number]

export function AuditLogPage() {
  // H2 (2026-09-13) — an institute is not a consultancy; the nouns follow `kind`.
  const words = useAccountWords()
  const [actorId, setActorId] = useState('')
  const [actionType, setActionType] = useState<AuditLogFilters['action_type'] | ''>('')
  const [area, setArea] = useState<AuditLogFilters['area'] | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const paging = useCursorPagination()

  function resetPaging() {
    paging.reset()
  }

  const entries = useAuditLog({
    actor_id: actorId || undefined,
    action_type: actionType || undefined,
    area: area || undefined,
    from: from || undefined,
    to: to && !dateRangeError(from, to) ? to : undefined,
    search: search || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: AUDIT_PAGE_SIZE,
  })

  const columns: TableColumn<Entry>[] = [
    {
      key: 'action_type',
      header: 'Action',
      sortable: true,
      render: (e) => (
        <Badge color={ACTION_COLORS[e.action_type as keyof typeof ACTION_COLORS] ?? 'secondary'}>
          {/* A case closing reads "Case closed", not "Update" (T4-24). */}
          {entryTitle(e as Parameters<typeof entryTitle>[0]) ?? actionLabel(e.action_type)}
        </Badge>
      ),
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
          {entityWord(e.entity_type)}
          {e.entity_label ? ` — ${e.entity_label}` : ''}
        </span>
      ),
    },
    {
      key: 'area',
      header: 'Area',
      sortable: true,
      render: (e) => <span className="text-text-secondary">{labelize(e.area)}</span>,
    },
    { key: 'created_at', header: 'When', sortable: true, render: (e) => formatDateTime(e.created_at) },
  ]

  // The server reads this log to the consultancy's Owner/Admin only (review F-021). The link and
  // the route are hidden from everyone else, but that is decided from the roster this browser
  // holds; when the server says no, that is the answer, and it is not a failure to load.
  if (entries.error instanceof ApiError && entries.error.status === 403) {
    return (
      <AppShell>
        <Card>
          <p className="text-body text-text-primary">You don&rsquo;t have access to this page.</p>
          <p className="mt-xs text-body-sm text-text-secondary">
            The audit log is open to the {words.org}&rsquo;s admin only.
          </p>
        </Card>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Audit Log</h1>
          {/* C5 (2026-09-13): "its own data" promised more than the log holds. This names what is
              actually written, and what is deliberately not. */}
          <p className="text-body-sm text-text-secondary">
            Every change to this {words.org}&rsquo;s records — leads, cases, plans, staff, settings, documents,
            phonebook and rating requests. Chat messages and internal notes are not logged.
          </p>
          <p className="mt-xs text-caption text-text-secondary">{AUDIT_SEARCH_HINT}</p>
          <AuditWindowNote from={from} />
        </div>

        <Table
          columns={columns}
          rows={entries.data?.items ?? []}
          rowKey={(e) => e.id}
          loading={entries.isLoading}
          error={entries.isError ? 'Could not load the audit log.' : undefined} errorSource={entries.error}
          emptyMessage={
            search || actorId || actionType || area || from || to
              ? 'No matching audit entries.'
              : 'No activity in the last 30 days. Every create, update and delete by your team lands here as it happens.'
          }
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
            placeholder: AUDIT_SEARCH_PLACEHOLDER,
          }}
          filters={
            <>
              {/* Who did it, searched on the server across the whole roster (lane x), people who
                  have left included: their entries are still in the log. */}
              <div className="w-56">
                <ServerSearchSelect
                  ariaLabel="Actor"
                  source={anyEmployeeSource}
                  value={actorId}
                  onChange={(id) => {
                    setActorId(id)
                    resetPaging()
                  }}
                  placeholder="Actor: anyone"
                  emptyText="No one matches that name."
                />
              </div>
              <CompactSelect
                value={actionType}
                onChange={(e) => {
                  setActionType(e.target.value as AuditLogFilters['action_type'] | '')
                  resetPaging()
                }}
                label="Action"
              >
                <option value="">Any action</option>
                <option value="create">Create</option>
                <option value="update">Update</option>
                <option value="delete">Delete</option>
              </CompactSelect>
              <CompactSelect
                value={area}
                onChange={(e) => {
                  setArea(e.target.value as AuditLogFilters['area'] | '')
                  resetPaging()
                }}
                label="Area"
              >
                <option value="">Any area</option>
                {CONSULTANCY_AUDIT_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {labelize(a)}
                  </option>
                ))}
              </CompactSelect>
              <AuditDateRange
                from={from}
                to={to}
                onFromChange={(value) => {
                  setFrom(value)
                  resetPaging()
                }}
                onToChange={(value) => {
                  setTo(value)
                  resetPaging()
                }}
              />
            </>
          }
          pagination={{
            // A page shorter than the limit is the last one, whatever cursor came with it (T4-24):
            // "Next" used to stay on and show the same page again.
            hasNext: Boolean(entries.data?.meta.next_cursor) && (entries.data?.items.length ?? 0) >= AUDIT_PAGE_SIZE,
            hasPrevious: paging.hasPrevious,
            onNext: () => entries.data?.meta.next_cursor && paging.next(entries.data.meta.next_cursor),
            onPrevious: paging.previous,
            // No total: the audit log is never counted (`meta.total` is always null, review F-114).
          }}
          expandable={{
            isExpanded: (e) => expandedId === e.id,
            renderExpanded: (e) => <AuditEntryDetail entry={e} />,
          }}
          onRowClick={(e) => setExpandedId((id) => (id === e.id ? null : e.id))}
        />
      </div>
    </AppShell>
  )
}

import { useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { CompactSelect } from '@/components/CompactSelect'
import { useSentpoUserDirectory } from '@/queries/adminUserDirectories'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate, formatDateTime } from '@/lib/time'

type Row = NonNullable<ReturnType<typeof useSentpoUserDirectory>['data']>['items'][number]

const DORMANT_DAYS_OPTIONS = [
  { value: '', label: 'Any activity' },
  { value: '7', label: 'No login in 7+ days' },
  { value: '30', label: 'No login in 30+ days' },
  { value: '90', label: 'No login in 90+ days' },
]

// Subtle warning, not red alarm (task spec) — the same soft-tinted Badge every other status pill
// on this platform uses, just the `warning` color rather than `error`.
// `dormantAfterDays` follows the page's active filter (N9, second-pass review): with "7+ days"
// selected, a hardcoded 30 left 10-day-idle rows unbadged next to badged 31-day ones, so the
// badge contradicted the very filter that produced the list. 30 stays the default when the
// filter is "Any activity".
function LastLoginCell({ row, dormantAfterDays }: { row: Row; dormantAfterDays: number }) {
  if (!row.last_login_at) {
    return (
      <span className="flex items-center gap-xs">
        <span className="text-text-secondary">Never</span>
        <Badge color="warning">Never logged in</Badge>
      </span>
    )
  }
  const daysSince = (Date.now() - new Date(row.last_login_at).getTime()) / (1000 * 60 * 60 * 24)
  return (
    <span className="flex items-center gap-xs">
      <span className="text-text-primary">{formatDateTime(row.last_login_at)}</span>
      {daysSince > dormantAfterDays && <Badge color="warning">Dormant</Badge>}
    </span>
  )
}

const STAGE_LABELS: Record<number, string> = { 1: 'Stage 1 · Exploring', 2: 'Stage 2 · Committed' }

// This is the SENTPO (student) directory — one row per student, never blended with the immiNow
// console directory (ImminowUsersPage.tsx / GET /admin/users/imminow). See docs/PROGRESS.md §4
// Step 3: "two screens, never one; the two populations must not blend."
export function SentpoUsersPage() {
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<'' | '1' | '2'>('')
  const [dormantDays, setDormantDays] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const paging = useCursorPagination()

  function resetPaging() {
    paging.reset()
  }

  const directory = useSentpoUserDirectory({
    search: search || undefined,
    stage: stage ? (Number(stage) as 1 | 2) : undefined,
    dormant_days: dormantDays ? Number(dormantDays) : undefined,
    from: from || undefined,
    to: to || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  const columns: TableColumn<Row>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (r) => (
        <div>
          <p className="font-medium text-text-primary">{r.name}</p>
          <p className="text-caption text-text-secondary">{r.email}</p>
        </div>
      ),
    },
    { key: 'created_at', header: 'Signed up', sortable: true, render: (r) => formatDate(r.created_at) },
    {
      key: 'last_login_at',
      header: 'Last login',
      sortable: true,
      render: (r) => <LastLoginCell row={r} dormantAfterDays={dormantDays ? Number(dormantDays) : 30} />,
    },
    {
      key: 'journey_stage',
      header: 'Journey',
      render: (r) => (
        <div>
          <p className="text-text-primary">{STAGE_LABELS[r.journey_stage] ?? r.journey_stage}</p>
          <p className="text-caption capitalize text-text-secondary">{r.journey_status.replace(/_/g, ' ')}</p>
        </div>
      ),
    },
    {
      key: 'consultancy_name',
      header: 'Consultancy',
      render: (r) => (r.consultancy_name ? r.consultancy_name : <span className="text-text-secondary">—</span>),
    },
    { key: 'points_balance', header: 'Points', align: 'right', sortable: true, render: (r) => r.points_balance },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Sentpo Users</h1>
          <p className="text-body-sm text-text-secondary">
            Every student account — signup, activity and journey stage. Gated to Platform Staff Administration.
          </p>
        </div>

        <Table
          columns={columns}
          rows={directory.data?.items ?? []}
          rowKey={(r) => r.id}
          loading={directory.isLoading}
          error={directory.isError ? 'Could not load the Sentpo user directory.' : undefined}
          emptyMessage="No students match these filters."
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
            placeholder: 'Search by name or email…',
          }}
          filters={
            <>
              <CompactSelect
                value={stage}
                onChange={(e) => {
                  setStage(e.target.value as '' | '1' | '2')
                  resetPaging()
                }}
                label="Journey stage"
              >
                <option value="">Any stage</option>
                <option value="1">Stage 1 · Exploring</option>
                <option value="2">Stage 2 · Committed</option>
              </CompactSelect>
              <CompactSelect
                value={dormantDays}
                onChange={(e) => {
                  setDormantDays(e.target.value)
                  resetPaging()
                }}
                label="Dormant"
              >
                {DORMANT_DAYS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </CompactSelect>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value)
                  resetPaging()
                }}
                aria-label="Signed up from"
                className="h-10 rounded-md border border-border bg-background px-3 text-body-sm"
              />
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value)
                  resetPaging()
                }}
                aria-label="Signed up to"
                className="h-10 rounded-md border border-border bg-background px-3 text-body-sm"
              />
            </>
          }
          pagination={{
            hasNext: Boolean(directory.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => directory.data?.meta.next_cursor && paging.next(directory.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: directory.data?.meta.total,
          }}
        />
      </div>
    </AdminShell>
  )
}

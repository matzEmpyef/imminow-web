import { useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { CompactSelect } from '@/components/CompactSelect'
import { useAdminConsultancies } from '@/queries/adminConsultancies'
import { useImminowUserDirectory } from '@/queries/adminUserDirectories'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'

type Row = NonNullable<ReturnType<typeof useImminowUserDirectory>['data']>['items'][number]

// This is the immiNow (console) directory — every consultancy's employees plus platform staff,
// distinguished by `kind`, never blended with the Sentpo student directory (SentpoUsersPage.tsx /
// GET /admin/users/sentpo). See docs/PROGRESS.md §4 Step 3.
export function ImminowUsersPage() {
  const [search, setSearch] = useState('')
  const [consultancyId, setConsultancyId] = useState('')
  const [active, setActive] = useState<'' | 'true' | 'false'>('')
  const [neverActive, setNeverActive] = useState(false)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const paging = useCursorPagination()
  const consultancies = useAdminConsultancies()

  function resetPaging() {
    paging.reset()
  }

  const directory = useImminowUserDirectory({
    search: search || undefined,
    consultancy_id: consultancyId || undefined,
    active: active === '' ? undefined : active === 'true',
    never_active: neverActive || undefined,
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
    {
      key: 'kind',
      header: 'Kind',
      render: (r) => (
        <Badge color={r.kind === 'platform_staff' ? 'secondary' : 'primary'}>
          {r.kind === 'platform_staff' ? 'Platform Staff' : 'Consultancy Staff'}
        </Badge>
      ),
    },
    {
      key: 'consultancy_name',
      header: 'Consultancy',
      render: (r) => r.consultancy_name ?? <span className="text-text-secondary">—</span>,
    },
    { key: 'designation', header: 'Designation', render: (r) => r.designation ?? '—' },
    {
      key: 'active',
      header: 'Status',
      render: (r) => <Badge color={r.active ? 'success' : 'secondary'}>{r.active ? 'Active' : 'Disabled'}</Badge>,
    },
    {
      key: 'invited_at',
      header: 'Invited / Accepted',
      sortable: true,
      render: (r) => {
        const neverActivated = (r.invited_at || r.accepted_at) && !r.last_login_at
        return (
          <div className="flex items-center gap-xs">
            <span className="text-text-primary">
              {r.invited_at ? formatDate(r.invited_at) : '—'} / {r.accepted_at ? formatDate(r.accepted_at) : '—'}
            </span>
            {/* Subtle warning, not red alarm (task spec) — same soft-tinted Badge as everywhere else. */}
            {neverActivated && <Badge color="warning">Never active</Badge>}
          </div>
        )
      },
    },
    {
      key: 'last_login_at',
      header: 'Last login',
      sortable: true,
      render: (r) => (r.last_login_at ? formatDate(r.last_login_at) : <span className="text-text-secondary">Never</span>),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">immiNow Users</h1>
          <p className="text-body-sm text-text-secondary">
            Every consultancy's employees plus Sentpo's own platform staff. Gated to Platform Staff Administration.
          </p>
        </div>

        <Table
          columns={columns}
          rows={directory.data?.items ?? []}
          rowKey={(r) => r.id}
          loading={directory.isLoading}
          error={directory.isError ? 'Could not load the immiNow user directory.' : undefined}
          emptyMessage={
            search || consultancyId || active || neverActive
              ? 'No users match these filters.'
              : 'No immiNow users yet. Staff appear here once a consultancy invites them.'
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
            placeholder: 'Search by name or email…',
          }}
          filters={
            <>
              <CompactSelect
                value={consultancyId}
                onChange={(e) => {
                  setConsultancyId(e.target.value)
                  resetPaging()
                }}
                label="Consultancy"
              >
                <option value="">Any (incl. platform staff)</option>
                {consultancies.data?.items?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </CompactSelect>
              <CompactSelect
                value={active}
                onChange={(e) => {
                  setActive(e.target.value as '' | 'true' | 'false')
                  resetPaging()
                }}
                label="Status"
              >
                <option value="">Any status</option>
                <option value="true">Active</option>
                <option value="false">Disabled</option>
              </CompactSelect>
              <label className="flex h-10 items-center gap-xs rounded-md border border-border bg-background px-3 text-body-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={neverActive}
                  onChange={(e) => {
                    setNeverActive(e.target.checked)
                    resetPaging()
                  }}
                />
                Never active
              </label>
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

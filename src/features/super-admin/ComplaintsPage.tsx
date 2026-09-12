import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { CompactSelect } from '@/components/CompactSelect'
import { FilterChip } from '@/components/FilterChip'
import { Table, type TableColumn } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'
import { useComplaints, type Complaint } from '@/queries/complaints'
import { ComplaintDrawer } from './cases/ComplaintDrawer'
import { ageLabel } from './cases/format'
import { CATEGORY_LABELS, COMPLAINT_STATUS_META } from './cases/labels'

const STATUS_CHIPS = [
  { key: 'unresolved', label: 'Unresolved', filterValue: 'open,in_review' },
  { key: 'open', label: 'Open', filterValue: 'open' },
  { key: 'in_review', label: 'In review', filterValue: 'in_review' },
  { key: 'resolved', label: 'Resolved', filterValue: 'resolved' },
  { key: 'all', label: 'All', filterValue: undefined },
] as const

type StatusKey = (typeof STATUS_CHIPS)[number]['key']

/**
 * Support's Complaints queue (rebuilt 2026-09-11 on the paged/notes/escalate contract). Problems
 * students report from the Sentpo app — the consultancy involved never sees them; resolution
 * happens through the Sentpo team, off-platform, with the note here as the only record.
 */
function isStatusKey(value: string | null): value is StatusKey {
  return STATUS_CHIPS.some((c) => c.key === value)
}

export function ComplaintsPage() {
  // Read once on mount, same one-way "URL sets the initial filter" convention Finance Dashboard's
  // Cases tab uses for ?rate=default — a deep link (e.g. Needs attention's "Open complaints" card)
  // should land pre-filtered, but the chips still drive the state from there.
  const [searchParams] = useSearchParams()
  const [statusKey, setStatusKey] = useState<StatusKey>(() => {
    const fromUrl = searchParams.get('status')
    return isStatusKey(fromUrl) ? fromUrl : 'unresolved'
  })
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const paging = useCursorPagination()

  function resetPaging() {
    paging.reset()
  }

  const statusValue = STATUS_CHIPS.find((c) => c.key === statusKey)?.filterValue

  const complaints = useComplaints({
    status: statusValue,
    category: category || undefined,
    search: search || undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  const rows = useMemo(() => complaints.data?.items ?? [], [complaints.data])
  const summary = complaints.data?.summary
  const [viewing, setViewing] = useState<Complaint | null>(null)

  const chipCount = (key: StatusKey): number | undefined => {
    if (!summary) return undefined
    switch (key) {
      case 'unresolved':
        return (summary.open ?? 0) + (summary.in_review ?? 0)
      case 'all':
        return (summary.open ?? 0) + (summary.in_review ?? 0) + (summary.resolved ?? 0)
      case 'open':
        return summary.open
      case 'in_review':
        return summary.in_review
      case 'resolved':
        return summary.resolved
    }
  }

  const columns: TableColumn<Complaint>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-text-primary">{c.student_name}</p>
          <p className="truncate text-caption text-text-secondary">{c.email}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (c) => (
        <div className="flex flex-col gap-xs">
          <span className="text-text-primary">{CATEGORY_LABELS[c.category] ?? c.category}</span>
          {(c.consultancy_change_requested || c.dispute_id) && (
            <div className="flex flex-wrap gap-xs">
              {c.consultancy_change_requested && <Badge color="warning">Wants to move</Badge>}
              {c.dispute_id && (
                <Badge color={c.dispute_status === 'resolved' ? 'secondary' : 'info'}>
                  {c.dispute_status === 'resolved' ? 'Dispute resolved' : 'In dispute'}
                </Badge>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'consultancy',
      header: 'Consultancy',
      hideBelow: 'md',
      render: (c) => (c.consultancy_name ? c.consultancy_name : <span className="text-text-secondary">—</span>),
    },
    {
      key: 'owner',
      header: 'Owner',
      hideBelow: 'lg',
      render: (c) =>
        c.assigned_to_name ? (
          <span className="text-text-primary">{c.assigned_to_name}</span>
        ) : (
          <span className="text-text-secondary">Unassigned</span>
        ),
    },
    {
      key: 'age',
      header: 'Age',
      align: 'right',
      hideBelow: 'sm',
      render: (c) => (
        <span className="whitespace-nowrap tabular-nums text-text-secondary">
          {c.status === 'resolved' && c.resolved_at ? `Resolved ${formatDate(c.resolved_at)}` : ageLabel(c.created_at)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <Badge color={COMPLAINT_STATUS_META[c.status]?.color ?? 'info'}>
          {COMPLAINT_STATUS_META[c.status]?.label ?? c.status}
        </Badge>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Complaints</h1>
          <p className="text-body-sm text-text-secondary">
            Problems students report from the Sentpo app. The consultancy never sees these — support handles them
            directly.
          </p>
        </div>

        <Table
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          loading={complaints.isLoading}
          error={complaints.isError ? 'Could not load complaints.' : undefined}
          emptyMessage="No complaints match these filters."
          onRowClick={(c) => setViewing(c)}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              resetPaging()
            },
            placeholder: 'Search student, email or description…',
          }}
          filters={
            <CompactSelect
              label="Category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value)
                resetPaging()
              }}
            >
              <option value="">Any category</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </CompactSelect>
          }
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
            </>
          }
          pagination={{
            hasNext: Boolean(complaints.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => complaints.data?.meta.next_cursor && paging.next(complaints.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: complaints.data?.meta.total,
          }}
        />
      </div>

      {viewing && (
        <ComplaintDrawer
          complaint={viewing}
          onClose={() => setViewing(null)}
          onUpdated={(updated) => setViewing(updated)}
        />
      )}
    </AdminShell>
  )
}

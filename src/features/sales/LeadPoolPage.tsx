import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '@/features/auth/AppShell'
import { Button } from '@/components/Button'
import { Table, type TableColumn } from '@/components/Table'
import { AssignConsultantMenu } from '@/components/AssignConsultantMenu'
import { AddLeadModal, ImportLeadsModal } from './ImportLeadsModal'
import { useFeature } from '@/lib/features'
import { useEmployees } from '@/queries/staff'
import { useAllocateLead, useBulkAllocateLeads, useLeads } from '@/queries/leads'
import { useCursorPagination } from '@/lib/pagination'
import { usePermissionChecker } from '@/lib/permissions'
import { formatDate } from '@/lib/time'

type Lead = NonNullable<ReturnType<typeof useLeads>['data']>['items'][number]

// C1: the raw enum read fine except for walk_in, which needs the hyphen (matches the label
// already used in ImportLeadsModal's Source dropdown).
const SOURCE_LABELS: Record<string, string> = {
  referral: 'Referral',
  website: 'Website',
  walk_in: 'Walk-in',
  social: 'Social',
  other: 'Other',
}

function SourceIcon({ origin }: { origin: 'sentpo' | 'imported' }) {
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-text-on-primary ${
        origin === 'sentpo' ? 'bg-primary' : 'bg-secondary'
      }`}
      title={origin === 'sentpo' ? 'Sentpo-sourced' : 'Self-added'}
    >
      {origin === 'sentpo' ? 'S' : 'M'}
    </span>
  )
}

export function LeadPoolPage() {
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const paging = useCursorPagination()

  const leads = useLeads({
    unallocated: true,
    search: search || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })
  const employees = useEmployees()
  const allocate = useAllocateLead()
  const bulkAllocate = useBulkAllocateLeads()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showAddLeadModal, setShowAddLeadModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  // Feature and permission are separate gates, deliberately composed rather than merged — the
  // feature says what the consultancy's plan includes, the permission says what this employee
  // may do with it. Mirrors leads.import / leads.allocate_from_pool enforcement on the
  // corresponding routes.
  const { can } = usePermissionChecker()
  const hasOwnLeads = useFeature('own_leads')
  const canImport = hasOwnLeads && can('leads.import')
  const canAllocate = can('leads.allocate_from_pool')

  const consultantOptions = useMemo(
    () => (employees.data?.items ?? []).map((e) => ({ id: e.id, name: `${e.user.first_name} ${e.user.last_name}` })),
    [employees.data],
  )

  function handleBulkAllocate(employeeId: string) {
    bulkAllocate.mutate(
      { lead_ids: [...selected], employee_id: employeeId },
      { onSuccess: () => setSelected(new Set()) },
    )
  }

  const columns: TableColumn<Lead>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (lead) => (
        <div className="flex items-center gap-sm">
          <SourceIcon origin={lead.origin} />
          <Link
            to={`/sales/leads/${lead.id}`}
            className="font-medium text-text-primary hover:text-primary hover:underline"
          >
            {lead.name}
          </Link>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (lead) =>
        lead.origin === 'imported' ? (lead.source ? (SOURCE_LABELS[lead.source] ?? lead.source) : '—') : 'Sentpo',
    },
    {
      key: 'created_at',
      header: 'Added',
      sortable: true,
      render: (lead) => formatDate(lead.created_at),
    },
    ...(canAllocate
      ? [
          {
            key: 'allocate',
            header: 'Allocate',
            render: (lead) => (
              <AssignConsultantMenu
                employees={consultantOptions}
                onSelect={(employeeId) => allocate.mutate({ id: lead.id, employeeId })}
                label={`Allocate ${lead.name}`}
                variant="icon"
              />
            ),
          } satisfies TableColumn<Lead>,
        ]
      : []),
  ]

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between gap-md">
          <h1 className="text-h1 text-text-primary">Lead Pool</h1>
          {canImport && (
            <div className="flex items-center gap-sm">
              <Button variant="secondary" onClick={() => setShowImportModal(true)}>
                Import Leads
              </Button>
              <Button onClick={() => setShowAddLeadModal(true)}>Add Lead</Button>
            </div>
          )}
        </div>

        {showAddLeadModal && <AddLeadModal onClose={() => setShowAddLeadModal(false)} />}
        {showImportModal && <ImportLeadsModal onClose={() => setShowImportModal(false)} />}

        <Table
          columns={columns}
          rows={leads.data?.items ?? []}
          rowKey={(lead) => lead.id}
          loading={leads.isLoading}
          error={leads.isError ? 'Could not load the lead pool.' : undefined}
          emptyMessage="No unallocated leads right now."
          sort={sort}
          onSortChange={(field, direction) => {
            setSort({ field, direction })
            paging.reset()
          }}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              paging.reset()
            },
            placeholder: 'Search leads…',
          }}
          filters={
            canAllocate &&
            selected.size > 0 && (
              <div className="flex items-center gap-sm">
                <span className="text-body-sm text-text-primary">{selected.size} selected</span>
                <AssignConsultantMenu
                  employees={consultantOptions}
                  onSelect={handleBulkAllocate}
                  label="Allocate Selected"
                  description={`Choose which consultant these ${selected.size} lead${selected.size === 1 ? '' : 's'} should be allocated to.`}
                  variant="button"
                  disabled={bulkAllocate.isPending}
                />
              </div>
            )
          }
          pagination={{
            hasNext: Boolean(leads.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => leads.data?.meta.next_cursor && paging.next(leads.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: leads.data?.meta.total,
          }}
          // Row selection exists solely to feed bulk allocation, so it's gated by the same key.
          selection={
            canAllocate
              ? {
                  selectedIds: selected,
                  onToggle: (id) =>
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (next.has(id)) next.delete(id)
                      else next.add(id)
                      return next
                    }),
                  onToggleAll: (ids) => setSelected(new Set(ids)),
                }
              : undefined
          }
        />
      </div>
    </AppShell>
  )
}

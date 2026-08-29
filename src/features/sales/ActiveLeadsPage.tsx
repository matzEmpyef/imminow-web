import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { TagEditorMenu } from '@/components/TagEditorMenu'
import { AssignConsultantMenu } from '@/components/AssignConsultantMenu'
import { StopPropagation } from '@/components/StopPropagation'
import { ReopenLeadModal } from './ReopenLeadModal'
import { useEmployees } from '@/queries/staff'
import { useAllocateLead, useLeads, useSetLeadTags } from '@/queries/leads'
import { useCreateTag, useTags } from '@/queries/tags'
import { useCursorPagination } from '@/lib/pagination'
import { usePermission } from '@/lib/permissions'

type Lead = NonNullable<ReturnType<typeof useLeads>['data']>['items'][number]

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// Modal isn't a portal, so without StopPropagation a click inside the confirm popup would
// bubble through this cell into the row's own onClick and navigate away — same wrapper
// AssignConsultantMenu.tsx/TagEditorMenu.tsx already use.
function ReopenLeadTrigger({ leadId, leadName }: { leadId: string; leadName: string }) {
  const [open, setOpen] = useState(false)
  return (
    <StopPropagation>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Reopen ${leadName}`}
        title={`Reopen ${leadName}`}
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
      {open && <ReopenLeadModal leadId={leadId} leadName={leadName} onClose={() => setOpen(false)} />}
    </StopPropagation>
  )
}

export function ActiveLeadsPage() {
  const navigate = useNavigate()
  // Deep-link support (user-requested, 2026-08-19 — clicking the Dashboard's "Unattended" stat
  // card should land here pre-filtered) — a lazy initializer only, not synced back to the URL as
  // the checkbox is toggled, matching how this page's other filters have never round-tripped
  // through the URL either.
  const [searchParams] = useSearchParams()
  const [assignedToMe, setAssignedToMe] = useState(false)
  const [unattendedOnly, setUnattendedOnly] = useState(() => searchParams.get('unattended') === 'true')
  const [showClosed, setShowClosed] = useState(false)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const paging = useCursorPagination()

  const leads = useLeads({
    unallocated: false,
    assignedToMe,
    unattended: unattendedOnly,
    showClosed,
    search: search || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })
  const employees = useEmployees()
  const reassign = useAllocateLead()
  const tags = useTags()
  const createTag = useCreateTag()
  const setLeadTags = useSetLeadTags()
  // Mirrors the leads.reassign enforcement on PATCH /leads/:id/assign. Only the reassign menu is
  // gated — the closed-lead Reopen trigger in the same column is tier-gated separately and stays.
  const canReassign = usePermission('leads.reassign')

  function resetPaging() {
    paging.reset()
  }

  const columns: TableColumn<Lead>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (lead) => (
        // C8: a real Link, not just a row onClick — middle-click/ctrl-click and keyboard nav
        // both work now, same StopPropagation pattern as CommissionDetailsPage's rows.
        <StopPropagation className="inline-block">
          <Link
            to={`/sales/leads/${lead.id}`}
            className="font-medium text-text-primary hover:text-primary hover:underline"
          >
            {lead.name}
          </Link>
        </StopPropagation>
      ),
    },
    {
      key: 'last_message_at',
      header: 'Last message',
      sortable: true,
      render: (lead) => (
        <span className="inline-block text-text-secondary" style={{ maxWidth: '14rem' }}>
          {lead.last_message_preview ?? 'No messages yet'}
          {lead.last_message_at && ` · ${timeAgo(lead.last_message_at)}`}
        </span>
      ),
    },
    {
      key: 'consultant_name',
      header: 'Consultant',
      sortable: true,
      render: (lead) => lead.assigned_employee_name ?? 'Unassigned',
    },
    {
      key: 'tags',
      header: 'Tags',
      render: (lead) => (
        <div className="flex items-center gap-xs">
          <div className="flex flex-wrap gap-xs">
            {lead.status === 'closed' && <Badge color="secondary">Closed</Badge>}
            {lead.unattended && <Badge color="error">Pending Response</Badge>}
            {lead.tags?.map((t) => (
              <Badge key={t} color="secondary">
                {t}
              </Badge>
            ))}
          </div>
          <TagEditorMenu
            tags={lead.tags ?? []}
            catalog={tags.data ?? []}
            onCreateTag={(name) => createTag.mutateAsync(name)}
            onSave={(next) => setLeadTags.mutate({ id: lead.id, tags: next })}
            saving={setLeadTags.isPending}
            label={`Edit tags for ${lead.name}`}
          />
        </div>
      ),
    },
    {
      key: 'reassign',
      header: 'Reassign',
      render: (lead) =>
        lead.status === 'closed' ? (
          <ReopenLeadTrigger leadId={lead.id} leadName={lead.name} />
        ) : !canReassign ? null : (
          <AssignConsultantMenu
            employees={(employees.data?.items ?? [])
              .filter((e) => e.id !== lead.assigned_employee_id)
              .map((e) => ({ id: e.id, name: `${e.user.first_name} ${e.user.last_name}` }))}
            onSelect={(employeeId) => reassign.mutate({ id: lead.id, employeeId })}
            label={`Reassign ${lead.name}`}
            description="Choose which consultant this should be reassigned to."
            variant="icon"
          />
        ),
    },
  ]

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <h1 className="text-h1 text-text-primary">Active Leads</h1>

        <Table
          columns={columns}
          rows={leads.data?.items ?? []}
          rowKey={(lead) => lead.id}
          loading={leads.isLoading}
          error={leads.isError ? 'Could not load active leads.' : undefined}
          emptyMessage="No leads match your filters."
          onRowClick={(lead) => navigate(`/sales/leads/${lead.id}`)}
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
            placeholder: 'Search leads…',
          }}
          filters={
            <>
              <label className="flex items-center gap-xs text-body-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={assignedToMe}
                  onChange={(e) => {
                    setAssignedToMe(e.target.checked)
                    resetPaging()
                  }}
                  className="h-4 w-4"
                />
                My leads only
              </label>
              <label className="flex items-center gap-xs text-body-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={unattendedOnly}
                  onChange={(e) => {
                    setUnattendedOnly(e.target.checked)
                    resetPaging()
                  }}
                  className="h-4 w-4"
                />
                Pending Response only
              </label>
              <label className="flex items-center gap-xs text-body-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={showClosed}
                  onChange={(e) => {
                    setShowClosed(e.target.checked)
                    resetPaging()
                  }}
                  className="h-4 w-4"
                />
                Show closed leads too
              </label>
            </>
          }
          pagination={{
            hasNext: Boolean(leads.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => leads.data?.meta.next_cursor && paging.next(leads.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: leads.data?.meta.total,
          }}
        />
      </div>
    </AppShell>
  )
}

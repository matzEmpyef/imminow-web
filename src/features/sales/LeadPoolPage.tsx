import { useState } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { Button } from '@/components/Button'
import { Table, type TableColumn } from '@/components/Table'
import { AssignConsultantMenu } from '@/features/sales/AssignConsultantMenu'
import { AddLeadModal, ImportLeadsModal } from './ImportLeadsModal'
import { RequestedBranchBadge, RequestedBranchNote } from '@/components/RequestedBranch'
import { useFeature } from '@/lib/features'
import { useBranches } from '@/queries/staff'
import { useAllocateLead, useBulkAllocateLeads, useLeads } from '@/queries/leads'
import { useCursorPagination } from '@/lib/pagination'
import { usePermissionChecker } from '@/lib/permissions'
import { useAccountWords } from '@/lib/accountWords'
import { Eye, XCircle } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { Toggle } from '@/components/Toggle'
import { ReopenTrigger } from '@/components/ReopenTrigger'
import { canOfferLeadReopen } from '@/lib/reopenRules'
import { ReopenLeadModal } from './ReopenLeadModal'
import { formatDate, relativeTime } from '@/lib/time'
import { LeadDetailModal } from '@/features/clients/LeadDetailModal'
import { CloseLeadModal } from './CloseLeadModal'
import { showToast } from '@/lib/toast'
import { ALREADY_APPLIED_NOTICE, isAlreadyApplied, usePayloadIdempotencyKey } from '@/lib/useIdempotencyKey'
import { LEAD_SOURCE_LABELS } from './leadSources'

type Lead = NonNullable<ReturnType<typeof useLeads>['data']>['items'][number]

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
  // H2 (2026-09-13) — an institute is not a consultancy; the nouns follow `kind`.
  const words = useAccountWords()
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  // A lead closed from the pool is still unassigned, so this is the only list it can appear in.
  const [showClosed, setShowClosed] = useState(false)
  const paging = useCursorPagination()

  const leads = useLeads({
    unallocated: true,
    showClosed,
    search: search || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })
  // Only worth a column when there is more than one branch to have asked for — on a single-branch
  // consultancy every answer is the same branch, which is no information at all.
  const branches = useBranches()
  const multiBranch = (branches.data?.length ?? 0) > 1
  const allocate = useAllocateLead()
  const bulkAllocate = useBulkAllocateLeads()
  // One key per selection and employee (review F-297): confirming the same allocation again after a
  // lost reply replays the first answer; a different selection is a new allocation.
  const bulkKey = usePayloadIdempotencyKey()
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

  // The lead whose study preference popup is open, or null.
  const [prefsLead, setPrefsLead] = useState<Lead | null>(null)
  // The lead being closed from its row, or null.
  const [closingLead, setClosingLead] = useState<Lead | null>(null)
  // Same permission that gates Close on the lead page.
  // One key closes leads and cases — the server enforces clients.close on both (console review C2,
  // 2026-09-13); `leads.close` never existed server-side, so this row control was always shown.
  const canClose = can('clients.close')

  function handleBulkAllocate(employeeId: string, consultantName: string | undefined) {
    // T8: pending guard + one key per confirmed selection — a double-fire of the same
    // confirmation is one allocation, not two.
    if (bulkAllocate.isPending) return
    const count = selected.size
    const body = { lead_ids: [...selected], employee_id: employeeId }
    bulkAllocate.mutate(
      { ...body, idempotencyKey: bulkKey.keyFor(body) },
      {
        onError: (err) => {
          bulkKey.settle(err)
          // Already allocated (the first reply was lost): the list is refreshed, so say so and clear it.
          if (isAlreadyApplied(err)) {
            setSelected(new Set())
            showToast(ALREADY_APPLIED_NOTICE)
          }
        },
        onSuccess: () => {
          setSelected(new Set())
          showToast(
            consultantName
              ? `${count} lead${count === 1 ? '' : 's'} allocated to ${consultantName}`
              : `${count} lead${count === 1 ? '' : 's'} allocated`,
          )
        },
      },
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
          <div className="flex flex-col">
            <span className="font-medium text-text-primary">{lead.name}</span>
            {/* Why it closed, in the server's own sentence ("The student ended this chat."). */}
            {lead.status === 'closed' && (
              <span className="flex flex-wrap items-center gap-xs">
                <Badge color="secondary">Closed</Badge>
                {lead.closed_reason_label && (
                  <span className="text-caption text-text-secondary">{lead.closed_reason_label}</span>
                )}
              </span>
            )}
          </div>
        </div>
      ),
    },
    // THE STUDENT'S LAST MESSAGE (user, 2026-09-10), in place of the lead page: what they asked is
    // what decides who to allocate them to. Two lines, then how long ago.
    {
      key: 'last_message',
      header: 'Last message',
      render: (lead) =>
        lead.last_student_message ? (
          <div className="flex flex-col" style={{ maxWidth: '24rem' }}>
            <span className="line-clamp-2 text-text-primary">{lead.last_student_message.content}</span>
            <span className="text-caption text-text-secondary">{relativeTime(lead.last_student_message.created_at)}</span>
          </div>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    // STUDY PREFERENCE IN A POPUP (user, 2026-09-10: "I need the popup... not inline table", and
    // "all info"). View opens the same LeadDetailModal Course Finder uses, which now shows every
    // preference field the lead carries. Imported leads have no student account, so no button.
    {
      key: 'study_preference',
      header: 'Study preference',
      render: (lead) =>
        lead.origin === 'imported' ? (
          <span className="text-text-secondary">—</span>
        ) : (
          <button
            type="button"
            onClick={() => setPrefsLead(lead)}
            aria-label={`View study preference for ${lead.name}`}
            className="inline-flex items-center gap-xs rounded-md px-sm py-xs text-body-sm font-medium text-primary hover:bg-primary/10"
          >
            <Eye className="h-4 w-4" aria-hidden />
            View
          </button>
        ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (lead) =>
        lead.origin === 'imported' ? (lead.source ? (LEAD_SOURCE_LABELS[lead.source] ?? lead.source) : '—') : 'Sentpo',
    },
    ...(multiBranch
      ? [
          {
            key: 'preferred_branch',
            header: 'Requested branch',
            // Sits immediately before Allocate, because it is an input to that decision and nothing
            // else. Always null on an imported lead — there is no student account behind that row
            // to have asked for anything.
            render: (lead: Lead) => <RequestedBranchBadge name={lead.preferred_branch_name} />,
          } satisfies TableColumn<Lead>,
        ]
      : []),
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
            render: (lead) =>
              lead.status === 'closed' ? null : (
                <AssignConsultantMenu
                  onSelect={(employeeId, consultantName) => {
                    allocate.mutate(
                      { id: lead.id, employeeId },
                      {
                        onSuccess: () =>
                          showToast(
                            consultantName ? `${lead.name} allocated to ${consultantName}` : `${lead.name} allocated`,
                          ),
                      },
                    )
                  }}
                  label={`Allocate ${lead.name}`}
                  variant="icon"
                />
              ),
          } satisfies TableColumn<Lead>,
        ]
      : []),
    ...(canClose
      ? [
          {
            key: 'close',
            header: 'Close',
            render: (lead) =>
              lead.status === 'closed' ? null : (
                <button
                  type="button"
                  onClick={() => setClosingLead(lead)}
                  aria-label={`Close ${lead.name}`}
                  title="Close lead"
                  className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-error/10 hover:text-error"
                >
                  <XCircle className="h-4 w-4" aria-hidden />
                </button>
              ),
          } satisfies TableColumn<Lead>,
        ]
      : []),
    // Reopen is not a permission of its own: the server says whether this lead may be reopened now.
    ...(showClosed
      ? [
          {
            key: 'reopen',
            header: 'Reopen',
            render: (lead) =>
              lead.status === 'closed' && canOfferLeadReopen(lead) ? (
                <ReopenTrigger
                  name={lead.name}
                  renderModal={(close) => (
                    <ReopenLeadModal
                      leadId={lead.id}
                      leadName={lead.name}
                      assigned={Boolean(lead.assigned_employee_id)}
                      onClose={close}
                    />
                  )}
                />
              ) : null,
          } satisfies TableColumn<Lead>,
        ]
      : []),
  ]

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        {prefsLead && (
          <LeadDetailModal lead={prefsLead} onClose={() => setPrefsLead(null)} showProfileLink={false} />
        )}
        {closingLead && (
          <CloseLeadModal leadId={closingLead.id} leadName={closingLead.name} onClose={() => setClosingLead(null)} />
        )}
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

        {multiBranch && <RequestedBranchNote />}

        {showAddLeadModal && <AddLeadModal onClose={() => setShowAddLeadModal(false)} />}
        {showImportModal && <ImportLeadsModal onClose={() => setShowImportModal(false)} />}

        <Table
          columns={columns}
          rows={leads.data?.items ?? []}
          rowKey={(lead) => lead.id}
          loading={leads.isLoading}
          error={leads.isError ? 'Could not load the lead pool.' : undefined} errorSource={leads.error}
          emptyMessage={
            search
              ? showClosed
                ? 'No leads in the pool, open or closed, match your search.'
                : 'No open leads in the pool match your search. If the lead was closed, switch on “Include closed”.'
              : showClosed
                ? 'No unallocated leads, open or closed, right now.'
                : `No unallocated leads right now. New Sentpo leads land here until a ${words.person} is allocated.`
          }
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
          filterActions={
            <label htmlFor="pool-include-closed" className="flex items-center gap-sm text-body-sm text-text-secondary">
              <Toggle
                id="pool-include-closed"
                checked={showClosed}
                onChange={(v) => {
                  setShowClosed(v)
                  setSelected(new Set())
                  paging.reset()
                }}
                label="Include closed"
              />
              Include closed
            </label>
          }
          filters={
            canAllocate &&
            selected.size > 0 && (
              // The count lives in the button itself (user, 2026-09-10: "Allocate 1 selected"), so what
              // it will do and to how many is one thing to read.
              <div className="flex items-center gap-sm">
                <AssignConsultantMenu
                  onSelect={handleBulkAllocate}
                  label={`Allocate ${selected.size} lead${selected.size === 1 ? '' : 's'}`}
                  buttonText={`Allocate ${selected.size} selected`}
                  description={`Choose which consultant ${selected.size === 1 ? 'this lead' : `these ${selected.size} leads`} should be allocated to.`}
                  variant="button"
                  disabled={bulkAllocate.isPending}
                />
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="rounded-md px-sm py-xs text-body-sm text-text-secondary hover:bg-background hover:text-text-primary"
                >
                  Clear
                </button>
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
                  // A closed lead cannot be allocated: it has to be reopened first.
                  isDisabled: (id) => leads.data?.items.find((l) => l.id === id)?.status === 'closed',
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

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRightLeft, RotateCcw, UserPlus } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { FieldLabel } from '@/components/FieldLabel'
import { SearchSelect, type SearchSelectOption } from '@/components/SearchSelect'
import { Table, type TableColumn } from '@/components/Table'
import { TagEditorMenu } from '@/components/TagEditorMenu'
import { StopPropagation } from '@/components/StopPropagation'
import { CreateApplicantModal } from './CreateApplicantModal'
import { ReopenClientModal } from './ReopenClientModal'
import { useAssignClient, useClients, useSetClientTags } from '@/queries/clients'
import { useMyConsultancy } from '@/queries/consultancy'
import { useCreateTag, useTags } from '@/queries/tags'
import { useCountries } from '@/queries/countries'
import { useEmployees } from '@/queries/staff'
import { usePermissionChecker } from '@/lib/permissions'
import { useCursorPagination } from '@/lib/pagination'

type Client = NonNullable<ReturnType<typeof useClients>['data']>['items'][number]

// Modal isn't a portal, so without StopPropagation a click inside the confirm popup would
// bubble through this cell into the row's own onClick and navigate away — same wrapper
// ActiveLeadsPage.tsx's own ReopenLeadTrigger uses.
function ReopenClientTrigger({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [open, setOpen] = useState(false)
  return (
    <StopPropagation>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Reopen ${clientName}`}
        title={`Reopen ${clientName}`}
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
      {open && <ReopenClientModal clientId={clientId} clientName={clientName} onClose={() => setOpen(false)} />}
    </StopPropagation>
  )
}

// Closes a real gap (user-requested, 2026-08-18) — a client allocated from the Applicant
// Allocation queue previously landed here with no way to assign it to a consultant. Generalized
// (user-requested, 2026-08-19 — "remove transfer applicant button... need ability to transfer
// consultant also") to also handle already-assigned clients: `PATCH /clients/{id}/assign` was
// always an unconditional reassignment server-side, so this one trigger now covers both the
// first assignment and later reassignment ("Transfer Consultant"), retiring the separate
// Transfer Applicant modal/endpoint outright instead of keeping two triggers side by side.
// `employeeOptions` is passed in rather than fetched per-row, same reasoning as
// ApplicantAllocationPage.tsx's AllocateAction.
function AssignClientTrigger({
  clientId,
  clientName,
  isAssigned,
  employeeOptions,
}: {
  clientId: string
  clientName: string
  isAssigned: boolean
  employeeOptions: SearchSelectOption[]
}) {
  const [open, setOpen] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const assign = useAssignClient(clientId)
  const label = isAssigned ? 'Transfer Consultant' : 'Assign to consultant'

  return (
    <StopPropagation>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label}: ${clientName}`}
        title={label}
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        {isAssigned ? <ArrowRightLeft className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
      </button>
      {open && (
        <Modal
          onClose={() => setOpen(false)}
          title={isAssigned ? 'Transfer Consultant' : 'Assign Consultant'}
          widthRem={26}
          footer={
            <>
              {assign.isError && <p className="mr-auto self-center text-body-sm text-error">{assign.error.message}</p>}
              <Button
                loading={assign.isPending}
                disabled={!employeeId}
                onClick={() => assign.mutate(employeeId, { onSuccess: () => setOpen(false) })}
              >
                {isAssigned ? 'Transfer' : 'Assign'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-secondary">
              {isAssigned ? 'Transfer' : 'Assign'} <span className="font-medium text-text-primary">{clientName}</span>{' '}
              to which consultant?
            </p>
            <div className="flex flex-col gap-xs">
              <FieldLabel htmlFor="assign-employee" required>
                Consultant
              </FieldLabel>
              <SearchSelect
                id="assign-employee"
                options={employeeOptions}
                value={employeeId}
                onChange={setEmployeeId}
                placeholder="Search consultants…"
              />
            </div>
          </div>
        </Modal>
      )}
    </StopPropagation>
  )
}

export function ClientsListPage() {
  const navigate = useNavigate()
  const consultancy = useMyConsultancy()
  const [assignedToMe, setAssignedToMe] = useState(false)
  const [unattendedOnly, setUnattendedOnly] = useState(false)
  const [tag, setTag] = useState('')
  const [country, setCountry] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const paging = useCursorPagination()

  // Tier and permission composed, not merged — the tier says what the consultancy bought, the
  // permission says what this employee may do with it (clients.create_applicant is also enforced
  // on POST /clients server-side).
  const { can } = usePermissionChecker()
  const canCreateApplicant =
    consultancy.data && ['business', 'ultimate'].includes(consultancy.data.tier) && can('clients.create_applicant')
  const canAssign = can('clients.reassign')
  const tags = useTags()
  const createTag = useCreateTag()
  const setClientTags = useSetClientTags()
  const countries = useCountries()
  const employees = useEmployees()
  const employeeOptions: SearchSelectOption[] = (employees.data?.items ?? []).map((e) => ({
    id: e.id!,
    label: `${e.user!.first_name} ${e.user!.last_name}`,
  }))

  const clients = useClients({
    assignedToMe,
    unattended: unattendedOnly,
    tag: tag || undefined,
    country: country || undefined,
    showClosed,
    search: search || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  function resetPaging() {
    paging.reset()
  }

  const columns: TableColumn<Client>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (client) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-xs">
            <span className="font-medium text-text-primary">
              {client.student.first_name} {client.student.last_name}
            </span>
            {client.unattended && <Badge color="error">Pending Response</Badge>}
            {client.status === 'closed' && <Badge color="secondary">Closed</Badge>}
          </div>
          {client.file_number && <span className="text-caption text-text-secondary">{client.file_number}</span>}
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (client) => <span className="text-text-secondary">{client.student.email}</span>,
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (client) => <span className="text-text-secondary">{client.student.phone ?? '—'}</span>,
    },
    {
      key: 'progress',
      header: 'Plan',
      sortable: true,
      render: (client) =>
        client.plan_template_name ? (
          <span className="text-text-secondary">
            {client.plan_template_name} ({client.progress})
          </span>
        ) : (
          <span className="text-text-secondary">No plan assigned</span>
        ),
    },
    {
      key: 'finalized_country',
      header: 'Country',
      render: (client) =>
        client.finalized_country ? (
          <span className="text-text-secondary">{client.finalized_country}</span>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    {
      key: 'tags',
      header: 'Tags',
      render: (client) => (
        <div className="flex items-center gap-xs">
          <div className="flex flex-wrap gap-xs">
            {client.tags?.map((t) => (
              <Badge key={t} color="secondary">
                {t}
              </Badge>
            ))}
          </div>
          <TagEditorMenu
            tags={client.tags ?? []}
            catalog={tags.data ?? []}
            onCreateTag={(name) => createTag.mutateAsync(name)}
            onSave={(next) => setClientTags.mutate({ id: client.id, tags: next })}
            saving={setClientTags.isPending}
            label={`Edit tags for ${client.student.first_name} ${client.student.last_name}`}
          />
        </div>
      ),
    },
    {
      key: 'consultant_name',
      header: 'Consultant',
      sortable: true,
      render: (client) => client.assigned_employee_name ?? <Badge color="warning">Unassigned</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (client) => {
        const clientName = `${client.student.first_name} ${client.student.last_name}`
        return (
          <div className="flex justify-end">
            {client.status === 'closed' ? (
              <ReopenClientTrigger clientId={client.id} clientName={clientName} />
            ) : (
              <>
                {canAssign && (
                  <AssignClientTrigger
                    clientId={client.id}
                    clientName={clientName}
                    isAssigned={Boolean(client.assigned_employee_id)}
                    employeeOptions={employeeOptions}
                  />
                )}
              </>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between gap-md">
          <h1 className="text-h1 text-text-primary">Clients</h1>
          {canCreateApplicant && <Button onClick={() => setShowCreateModal(true)}>Create Applicant</Button>}
        </div>

        {showCreateModal && <CreateApplicantModal onClose={() => setShowCreateModal(false)} />}

        <Table
          columns={columns}
          rows={clients.data?.items ?? []}
          rowKey={(client) => client.id}
          loading={clients.isLoading}
          error={clients.isError ? 'Could not load clients.' : undefined}
          emptyMessage="No clients match your filters."
          onRowClick={(client) => navigate(`/clients/${client.id}`)}
          rowClassName={(client) => (!client.assigned_employee_id ? 'bg-warning-subtle' : undefined)}
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
            placeholder: 'Search clients…',
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
                My clients only
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
                Show closed & completed clients too
              </label>
              <select
                value={tag}
                onChange={(e) => {
                  setTag(e.target.value)
                  resetPaging()
                }}
                className="h-9 rounded-md border border-border bg-background px-3 text-body-sm"
              >
                <option value="">All tags</option>
                {tags.data?.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value)
                  resetPaging()
                }}
                className="h-9 rounded-md border border-border bg-background px-3 text-body-sm"
              >
                <option value="">All countries</option>
                {countries.data?.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </>
          }
          pagination={{
            hasNext: Boolean(clients.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => clients.data?.meta.next_cursor && paging.next(clients.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: clients.data?.meta.total,
          }}
        />
      </div>
    </AppShell>
  )
}

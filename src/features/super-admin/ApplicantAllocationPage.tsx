import { useMemo, useState } from 'react'
import { UserPlus, ShieldCheck } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Modal } from '@/components/Modal'
import { FieldLabel } from '@/components/FieldLabel'
import { SearchSelect, type SearchSelectOption } from '@/components/SearchSelect'
import { Table, type TableColumn } from '@/components/Table'
import {
  useApplicantAllocationQueue,
  useAllocateApplicant,
  useResolveAllocationRequest,
} from '@/queries/applicantAllocation'
import { useAdminConsultancies } from '@/queries/adminConsultancies'
import { formatDate } from '@/lib/time'
import type { components } from '@/api/schema'

type QueueEntry = components['schemas']['ApplicantAllocationEntry']
type Consultancy = components['schemas']['Consultancy']

const REASON_LABELS: Record<string, string> = {
  freelancer_sourced: 'Freelancer-sourced',
  consultancy_change: 'Requested a change',
}

// The other half of a consultancy-change request (user, 2026-08-23: "admin can choose to mark it
// as resolved and do not transfer and remove from transfer list"). Same row-level-component
// reasoning as AllocateAction below — the mutation is keyed by entry id, so it needs its own
// render top level.
//
// A note is required, and deliberately so: this ends a student's request without giving them what
// they asked for, and the reason has to survive on the complaint for whoever handles it next.
function ResolveAction({ entry }: { entry: QueueEntry }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const resolve = useResolveAllocationRequest(entry.id!)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Decline the transfer request from ${entry.applicant_name}`}
        title="Resolve without transferring"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <ShieldCheck className="h-4 w-4" />
      </button>
      {open && (
        <Modal
          onClose={() => setOpen(false)}
          title="Resolve Without Transferring"
          widthRem={28}
          footer={
            <>
              {resolve.isError && (
                <p className="mr-auto self-center text-body-sm text-error">{resolve.error.message}</p>
              )}
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                loading={resolve.isPending}
                disabled={!note.trim()}
                onClick={() => resolve.mutate(note.trim(), { onSuccess: () => setOpen(false) })}
              >
                Resolve
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-secondary">
              <span className="font-medium text-text-primary">{entry.applicant_name}</span> stays with{' '}
              {entry.current_consultancy_name ?? 'their current consultancy'} — same plan, same consultant. This only
              removes them from the transfer list.
            </p>
            <div className="flex flex-col gap-xs">
              <FieldLabel htmlFor={`resolve-note-${entry.id}`} required>
                Why are you declining the transfer?
              </FieldLabel>
              <textarea
                id={`resolve-note-${entry.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Recorded against the complaint for whoever handles it next."
                className="w-full rounded-md border border-border bg-surface p-sm text-body outline-none focus:border-primary"
              />
            </div>
            <p className="text-caption text-text-secondary">
              The complaint itself stays open — declining a transfer is not the same as resolving what they complained
              about.
            </p>
          </div>
        </Modal>
      )}
    </>
  )
}

// Row-level component, same reasoning as every other row-action popup this session —
// useAllocateApplicant(entry.id) must be called at its own render top level, not inside Table's
// `render: (row) => ...` callback. Converted from an inline <select> + Button per row to an icon +
// popup (user-requested, 2026-08-18) — a SearchSelect instead of a plain <select> here too, same
// as Ads Manager's consultancy picker, since this list could plausibly span many consultancies.
function AllocateAction({ entry, consultancies }: { entry: QueueEntry; consultancies: Consultancy[] }) {
  const [open, setOpen] = useState(false)
  const [consultancyId, setConsultancyId] = useState('')
  const allocate = useAllocateApplicant(entry.id!)

  // User-requested (2026-08-19) — "if enabled then only applicant allocation from freelancer
  // possible." Only freelancer_sourced entries are gated on the target's own freelancer_enabled
  // flag — a consultancy-change entry has no freelancer involved, so every active consultancy
  // stays offered for those, same as before this change.
  const eligible =
    entry.reason === 'freelancer_sourced' ? consultancies.filter((c) => c.freelancer_enabled) : consultancies
  const consultancyOptions: SearchSelectOption[] = eligible.map((c) => ({ id: c.id!, label: c.name ?? '' }))

  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Allocate ${entry.applicant_name}`}
        title="Allocate to Consultancy"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <UserPlus className="h-4 w-4" />
      </button>
      {open && (
        <Modal
          onClose={() => setOpen(false)}
          title="Allocate to Consultancy"
          widthRem={26}
          footer={
            <>
              {allocate.isError && (
                <p className="mr-auto self-center text-body-sm text-error">{allocate.error.message}</p>
              )}
              <Button
                loading={allocate.isPending}
                disabled={!consultancyId}
                onClick={() => allocate.mutate(consultancyId, { onSuccess: () => setOpen(false) })}
              >
                Allocate
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-secondary">
              Allocate <span className="font-medium text-text-primary">{entry.applicant_name}</span> to which
              consultancy?
            </p>
            {entry.reason === 'freelancer_sourced' && (
              <p className="text-caption text-text-secondary">
                Only consultancies with the freelancer channel enabled are shown — manage this in Manage Consultancies.
              </p>
            )}
            <div className="flex flex-col gap-xs">
              <FieldLabel htmlFor="allocate-consultancy" required>
                Consultancy
              </FieldLabel>
              <SearchSelect
                id="allocate-consultancy"
                options={consultancyOptions}
                value={consultancyId}
                onChange={setConsultancyId}
                placeholder="Search consultancy…"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export function ApplicantAllocationPage() {
  const queue = useApplicantAllocationQueue()
  const consultancies = useAdminConsultancies({ active: true })
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    let items = queue.data ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((e) => e.applicant_name?.toLowerCase().includes(q))
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av =
          sort.field === 'created_at'
            ? (a.created_at ?? '')
            : sort.field === 'reason'
              ? (a.reason ?? '')
              : (a.applicant_name ?? '').toLowerCase()
        const bv =
          sort.field === 'created_at'
            ? (b.created_at ?? '')
            : sort.field === 'reason'
              ? (b.reason ?? '')
              : (b.applicant_name ?? '').toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [queue.data, search, sort])

  const columns: TableColumn<QueueEntry>[] = [
    {
      key: 'applicant_name',
      header: 'Applicant',
      sortable: true,
      render: (e) => <span className="font-medium text-text-primary">{e.applicant_name}</span>,
    },
    {
      key: 'reason',
      header: 'Reason',
      sortable: true,
      render: (e) => (
        <div>
          <Badge color="warning">{REASON_LABELS[e.reason!] ?? e.reason}</Badge>
          {/* User-requested (2026-08-19) — "if freelancer sourced please show freelancer name
              too." */}
          {e.reason === 'freelancer_sourced' && (
            <p className="mt-0.5 text-caption text-text-secondary">{e.freelancer_name ?? 'Unknown freelancer'}</p>
          )}
          {e.reason === 'consultancy_change' && (
            <div className="mt-0.5">
              {/* The grievance itself, in place — the admin decides having read WHY they want out,
                  not just that they do. */}
              <p className="text-caption text-text-secondary">
                Currently with {e.current_consultancy_name ?? 'their consultancy'}
              </p>
              {e.complaint_description && (
                <p className="mt-0.5 max-w-md text-caption italic text-text-secondary">“{e.complaint_description}”</p>
              )}
            </div>
          )}
        </div>
      ),
    },
    { key: 'created_at', header: 'Waiting Since', sortable: true, render: (e) => formatDate(e.created_at!) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) => (
        <div className="flex items-center justify-end gap-xs">
          {/* Only a change REQUEST can be declined — the others have no requester to decline. */}
          {e.reason === 'consultancy_change' && <ResolveAction entry={e} />}
          <AllocateAction entry={e} consultancies={consultancies.data?.items ?? []} />
        </div>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Applicant Allocation</h1>
          <p className="text-body-sm text-text-secondary">
            Freelancer-sourced applicants awaiting a consultancy, and students asking to move to a different one.
          </p>
        </div>

        <Table
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id!}
          loading={queue.isLoading}
          emptyMessage="Nothing awaiting allocation."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search applicant…' }}
        />
      </div>
    </AdminShell>
  )
}

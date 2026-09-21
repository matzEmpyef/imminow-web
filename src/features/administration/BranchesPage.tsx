import { useMemo, useState } from 'react'
import { Ban, CheckCircle2, Pencil } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { BranchFormModal } from './BranchFormModal'
import { branchHasLocation, formatBranchLocation } from './branchLocation'
import { useBranches, useUpdateBranch } from '@/queries/staff'
import type { components } from '@/api/schema'

type Branch = components['schemas']['Branch']

// Row-level component so useUpdateBranch(branch.id) can be called at its own render top level —
// Table's `render: (row) => ...` runs as a callback, not a component body, so hooks can't be
// called directly inside it (Rules of Hooks).
function BranchActions({ branch, onEdit }: { branch: Branch; onEdit: () => void }) {
  const updateBranch = useUpdateBranch(branch.id!)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  return (
    // Modal isn't a portal, so without this wrapper's stopPropagation, clicks inside the open
    // confirm popup would bubble through this cell into the table row's own click handling —
    // same fix TagEditorMenu.tsx/AssignConsultantMenu.tsx already use.
    <div className="flex justify-end gap-xs">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${branch.name}`}
        title="Edit"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Pencil className="h-4 w-4" />
      </button>
      {branch.active ? (
        <button
          type="button"
          onClick={() => setConfirmDeactivate(true)}
          aria-label={`Deactivate ${branch.name}`}
          title="Deactivate"
          className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
        >
          <Ban className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => updateBranch.mutate({ name: branch.name, address: branch.address, active: true })}
          disabled={updateBranch.isPending}
          aria-label={`Activate ${branch.name}`}
          title="Activate"
          className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-success"
        >
          <CheckCircle2 className="h-4 w-4" />
        </button>
      )}

      {confirmDeactivate && (
        <Modal
          onClose={() => setConfirmDeactivate(false)}
          title="Deactivate Branch"
          widthRem={24}
          footer={
            <div className="flex gap-sm">
              <Button
                variant="destructive"
                loading={updateBranch.isPending}
                onClick={() =>
                  updateBranch.mutate(
                    { name: branch.name, address: branch.address, active: false },
                    { onSuccess: () => setConfirmDeactivate(false) },
                  )
                }
              >
                Deactivate
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDeactivate(false)}>
                Cancel
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-secondary">
              <strong className="text-text-primary">{branch.name}</strong> will be marked inactive. Its staff and
              history stay intact — you can reactivate it any time.
            </p>
            {updateBranch.isError && <p className="text-body-sm text-error">{updateBranch.error.message}</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}

export function BranchesPage() {
  const branches = useBranches()
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    let items = branches.data ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.address.toLowerCase().includes(q) ||
          // The city/district/state/country moved OUT of `address` on 2026-09-21, so a search that
          // only read the street line stopped finding "Delhi" the day the location was filled in.
          formatBranchLocation(b).toLowerCase().includes(q),
      )
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av = sort.field === 'employee_count' ? (a.employee_count ?? 0) : a.name.toLowerCase()
        const bv = sort.field === 'employee_count' ? (b.employee_count ?? 0) : b.name.toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [branches.data, search, sort])

  const columns: TableColumn<Branch>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (branch) => (
        <div className="flex items-center gap-sm">
          <span className="font-medium text-text-primary">{branch.name}</span>
          <Badge color={branch.active ? 'success' : 'secondary'}>{branch.active ? 'Active' : 'Inactive'}</Badge>
        </div>
      ),
    },
    { key: 'address', header: 'Street address', render: (branch) => branch.address },
    {
      key: 'location',
      header: 'Location',
      // The four picked levels, narrowest first. A branch without them is not a broken row — it is
      // simply one students can never be offered by nearness, which is a different and fixable
      // thing, so it says that rather than showing an em dash.
      render: (branch) =>
        branchHasLocation(branch) ? (
          <span className="text-text-secondary">{formatBranchLocation(branch)}</span>
        ) : (
          <Badge color="warning">Location not set</Badge>
        ),
    },
    {
      key: 'employee_count',
      header: 'Staff',
      sortable: true,
      align: 'right',
      render: (branch) => branch.employee_count ?? 0,
    },
    {
      key: 'actions',
      header: '',
      render: (branch) => <BranchActions branch={branch} onEdit={() => setEditingId(branch.id!)} />,
    },
  ]

  const editingBranch = branches.data?.find((b) => b.id === editingId)

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h1 className="text-h1 text-text-primary">Branches</h1>
            <p className="text-body-sm text-text-secondary">
              Students choose which of your branches to talk to, and see the nearest one first. A branch needs its
              country, state, district and city filled in before it can be offered that way.
            </p>
          </div>
          <Button onClick={() => setShowAddModal(true)}>Add Branch</Button>
        </div>

        {showAddModal && <BranchFormModal onClose={() => setShowAddModal(false)} />}
        {editingBranch && <BranchFormModal branch={editingBranch} onClose={() => setEditingId(null)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(branch) => branch.id!}
          loading={branches.isLoading}
          error={branches.isError ? 'Could not load branches.' : undefined}
          emptyMessage={
            search
              ? 'No branches match your search.'
              : 'No branches yet. Add one to group employees and clients by location.'
          }
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search branches…' }}
        />
      </div>
    </AppShell>
  )
}

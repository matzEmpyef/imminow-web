import { useMemo, useState, type FormEvent } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Toggle } from '@/components/Toggle'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import {
  useCreatePlatformStaff,
  useDisablePlatformStaff,
  usePlatformStaff,
  useUpdatePlatformStaffPermissions,
} from '@/queries/platformTeam'
import type { components } from '@/api/schema'
import { EMAIL_ERROR, isValidEmail } from '@/lib/validation'

type PlatformStaff = components['schemas']['PlatformStaff']

const PERMISSION_LABELS: Record<string, string> = {
  consultancy_approval: 'Consultancy Approval',
  catalog: 'Catalog',
  ads: 'Ads',
  points_coupons: 'Points & Coupons',
  content: 'Content',
  finance: 'Finance',
  support: 'Support',
  platform_staff_administration: 'Platform Staff Administration',
}

// User-requested (2026-08-15) — "wherever there is add button, use popup, instead of inline
// form." Was an inline Card that expanded below the page header; now a Modal, same fields.
function AddStaffForm({ onClose }: { onClose: () => void }) {
  const createStaff = useCreatePlatformStaff()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const emailError = email && !isValidEmail(email) ? EMAIL_ERROR : undefined
  const canSubmit = Boolean(name && email) && !emailError

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    createStaff.mutate({ name, email }, { onSuccess: () => onClose() })
  }

  return (
    <Modal
      onClose={onClose}
      title="Invite Staff"
      widthRem={26}
      footer={
        <>
          {createStaff.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{createStaff.error.message}</p>
          )}
          <Button type="submit" form="add-staff-form" loading={createStaff.isPending} disabled={!canSubmit}>
            Invite
          </Button>
        </>
      }
    >
      <form id="add-staff-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
        />
      </form>
    </Modal>
  )
}

function PermissionsPanel({ staff }: { staff: PlatformStaff }) {
  const updatePermissions = useUpdatePlatformStaffPermissions(staff.id!)

  return (
    <div className="flex flex-col gap-xs">
      {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
        <div key={key} className="flex items-center justify-between">
          <span className="text-body-sm text-text-primary">{label}</span>
          <Toggle
            checked={Boolean(staff.permissions?.[key as keyof typeof staff.permissions])}
            onChange={(checked) => updatePermissions.mutate({ [key]: checked })}
            label={`${staff.name} ${label}`}
          />
        </div>
      ))}
    </div>
  )
}

// Row-level component so useDisablePlatformStaff() can be called at its own render top level —
// Table's `render: (row) => ...` runs as a callback, not a component body.
function StaffActions({
  staff,
  expanded,
  onToggle,
}: {
  staff: PlatformStaff
  expanded: boolean
  onToggle: () => void
}) {
  const disableStaff = useDisablePlatformStaff()
  const [confirmingDisable, setConfirmingDisable] = useState(false)

  if (staff.is_super_admin) return null

  return (
    <div className="flex items-center justify-end gap-sm">
      <Button variant="secondary" onClick={onToggle}>
        {expanded ? 'Collapse' : 'Manage'}
      </Button>
      {staff.active && (
        <Button variant="destructive" onClick={() => setConfirmingDisable(true)}>
          Disable
        </Button>
      )}
      {/* User-requested (2026-08-15) — "wherever there is delete, confirm popup is needed." */}
      {confirmingDisable && (
        <Modal
          onClose={() => setConfirmingDisable(false)}
          title="Disable Staff"
          widthRem={24}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmingDisable(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={disableStaff.isPending}
                onClick={() => disableStaff.mutate(staff.id!, { onSuccess: () => setConfirmingDisable(false) })}
              >
                Disable
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Disable <span className="font-medium text-text-primary">{staff.name}</span>? They'll lose platform access
            immediately.
          </p>
        </Modal>
      )}
    </div>
  )
}

export function PlatformTeamPage() {
  const staff = usePlatformStaff()
  const [showAdd, setShowAdd] = useState(false)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const rows = useMemo(() => {
    let items = staff.data ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((s) => s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q))
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av = (a.name ?? '').toLowerCase()
        const bv = (b.name ?? '').toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [staff.data, search, sort])

  const columns: TableColumn<PlatformStaff>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (s) => (
        <div className="flex items-center gap-sm">
          <span className="font-medium text-text-primary">{s.name}</span>
          {s.is_super_admin && <Badge color="primary">Super Admin</Badge>}
          <Badge color={s.active ? 'success' : 'secondary'}>{s.active ? 'Active' : 'Disabled'}</Badge>
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (s) => s.email },
    {
      key: 'actions',
      header: '',
      render: (s) => (
        <StaffActions
          staff={s}
          expanded={expandedId === s.id}
          onToggle={() => setExpandedId((id) => (id === s.id ? null : s.id!))}
        />
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Platform Team</h1>
            <p className="text-body-sm text-text-secondary">
              Super Admin and Platform Staff accounts. Super Admin has every flag permanently on.
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)}>Invite Staff</Button>
        </div>

        {showAdd && <AddStaffForm onClose={() => setShowAdd(false)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(s) => s.id!}
          loading={staff.isLoading}
          emptyMessage="No platform staff yet."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search name or email…' }}
          expandable={{
            isExpanded: (s) => expandedId === s.id,
            renderExpanded: (s) => <PermissionsPanel staff={s} />,
          }}
        />
      </div>
    </AdminShell>
  )
}

import { useMemo, useState, type FormEvent } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { PowerOff, SlidersHorizontal } from 'lucide-react'
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
import type { PlatformPermissionKey } from '@/features/auth/PlatformRoute'
import { EMAIL_ERROR, isValidEmail } from '@/lib/validation'

type PlatformStaff = components['schemas']['PlatformStaff']

// Eighteen switches, grouped the way the console's sections are (2026-09-10, user: "make sure
// enough controls are there to allocate different things to admin team") — was eight, so handing
// someone the blog meant handing them events and jobs too. Each says in plain words what it opens.
const PERMISSION_GROUPS: { title: string; flags: { key: PlatformPermissionKey; label: string; hint: string }[] }[] = [
  {
    title: 'Consultancies',
    flags: [
      {
        key: 'consultancy_approval',
        label: 'Manage consultancies',
        hint: 'Create, approve and suspend consultancies; KYC, plans and features, ratings, Performance League',
      },
      { key: 'applicant_allocation', label: 'Applicant allocation', hint: 'Assign applicants waiting for a consultancy' },
    ],
  },
  {
    title: 'Catalog',
    flags: [
      { key: 'catalog', label: 'Colleges & courses', hint: 'Colleges, courses, CSV import, course suggestions, institutions' },
      {
        key: 'catalog_settings',
        label: 'Catalog settings',
        hint: 'Countries and their guides, exams, study levels, exchange rates, course popularity',
      },
    ],
  },
  {
    title: 'Marketing',
    flags: [
      { key: 'ads', label: 'Ads', hint: 'Ads Manager and audience counts' },
      { key: 'points_coupons', label: 'Points & coupons', hint: 'Earn rules, coupons, redemption partners' },
      { key: 'events', label: 'Events', hint: 'Webinars, quizzes and in-person meetings, including attendance' },
      { key: 'jobs', label: 'Jobs', hint: 'Job listings' },
      { key: 'blog', label: 'Blog', hint: 'Blog articles and category mapping' },
    ],
  },
  {
    title: 'Finance',
    flags: [
      { key: 'finance', label: 'Finance', hint: 'Commission rates, platform payments, Finance Dashboard' },
      { key: 'freelancers', label: 'Freelancers', hint: 'Freelancers, their rates and payouts' },
    ],
  },
  {
    title: 'Support',
    flags: [
      { key: 'support', label: 'Cases', hint: 'Complaints, disputes, follow-ups, visit requests, applicant case view' },
      {
        key: 'support_tools',
        label: 'Support tools',
        hint: 'Look up any user, export their data, change a locked-out email, switch consultancy',
      },
    ],
  },
  {
    title: 'Admin',
    flags: [
      {
        key: 'team_management',
        label: 'Team management',
        hint: 'Invite and disable staff, and change anyone’s permissions — including their own',
      },
      { key: 'user_directory', label: 'User directory', hint: 'Sentpo and immiNow user lists' },
      { key: 'notifications', label: 'Notifications', hint: 'Notification channel config and broadcasts' },
      { key: 'app_config', label: 'App config', hint: 'Minimum app version and other app-wide settings' },
      { key: 'audit_log', label: 'Audit log', hint: 'The platform-wide audit log' },
    ],
  },
]

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
  const has = (key: PlatformPermissionKey) => Boolean(staff.permissions?.[key])

  return (
    <div className="flex flex-col gap-lg">
      <p className="text-body-sm text-text-secondary">
        Each switch opens one area of the console, and they see only what is switched on. Changes apply the next time
        they open a page.
      </p>
      {PERMISSION_GROUPS.map((group) => {
        const allOn = group.flags.every((flag) => has(flag.key))
        return (
          <section key={group.title} className="flex flex-col gap-sm">
            <div className="flex items-center justify-between border-b border-border pb-xs">
              <h3 className="text-caption font-medium uppercase tracking-wide text-text-secondary">{group.title}</h3>
              {/* The whole area at once — the common case is "give them all of Marketing". */}
              <button
                type="button"
                disabled={updatePermissions.isPending}
                onClick={() => updatePermissions.mutate(Object.fromEntries(group.flags.map((flag) => [flag.key, !allOn])))}
                className="text-caption font-medium text-primary hover:underline disabled:opacity-50"
              >
                {allOn ? 'Turn all off' : 'Turn all on'}
              </button>
            </div>
            {group.flags.map((flag) => (
              <div key={flag.key} className="flex items-start justify-between gap-md">
                <div className="min-w-0">
                  <p className="text-body-sm text-text-primary">{flag.label}</p>
                  <p className="text-caption text-text-secondary">{flag.hint}</p>
                </div>
                <Toggle
                  checked={has(flag.key)}
                  onChange={(checked) => updatePermissions.mutate({ [flag.key]: checked })}
                  label={`${staff.name} ${flag.label}`}
                />
              </div>
            ))}
          </section>
        )
      })}
      {updatePermissions.isError && <p className="text-body-sm text-error">{updatePermissions.error.message}</p>}
    </div>
  )
}

// Row-level component so useDisablePlatformStaff() can be called at its own render top level —
// Table's `render: (row) => ...` runs as a callback, not a component body.
function StaffActions({ staff }: { staff: PlatformStaff }) {
  const disableStaff = useDisablePlatformStaff()
  const [confirmingDisable, setConfirmingDisable] = useState(false)
  // Manage opens a popup rather than expanding the row (user-requested, 2026-08-27). The inline
  // expansion put a column of toggles inside the table, which pushed every other row down and gave
  // the permissions no room to breathe; a modal is also what every other "edit this record" action
  // on this console already does.
  const [managing, setManaging] = useState(false)

  if (staff.is_super_admin) return null

  return (
    // Same stop-propagation reasoning as BranchesPage: without it a click here bubbles into the
    // row's own handling.
    <div className="flex items-center justify-end gap-xs">
      <button
        type="button"
        onClick={() => setManaging(true)}
        aria-label={`Manage permissions for ${staff.name}`}
        title="Manage permissions"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>
      {staff.active && (
        <button
          type="button"
          onClick={() => setConfirmingDisable(true)}
          aria-label={`Disable ${staff.name}`}
          title="Disable"
          className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
        >
          <PowerOff className="h-4 w-4" />
        </button>
      )}
      {managing && (
        <Modal onClose={() => setManaging(false)} title={`${staff.name} — Permissions`} widthRem={34}>
          <PermissionsPanel staff={staff} />
        </Modal>
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
      render: (s) => <StaffActions staff={s} />,
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
          error={staff.isError ? 'Could not load platform staff.' : undefined}
          emptyMessage="No platform staff yet. Invite a colleague with Invite Staff above."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search name or email…' }}
        />
      </div>
    </AdminShell>
  )
}

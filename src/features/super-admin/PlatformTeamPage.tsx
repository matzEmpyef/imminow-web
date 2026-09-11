import { useMemo, useState, type FormEvent } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Toggle } from '@/components/Toggle'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import { Drawer } from '@/components/Drawer'
import { FilterChip } from '@/components/FilterChip'
import {
  useCreatePlatformStaff,
  useDisablePlatformStaff,
  useEnablePlatformStaff,
  usePlatformStaff,
  useResendPlatformStaffInvite,
  useUpdatePlatformStaffPermissions,
} from '@/queries/platformTeam'
import { useAuthStore } from '@/stores/authStore'
import type { components } from '@/api/schema'
import type { PlatformPermissionKey } from '@/features/auth/PlatformRoute'
import { EMAIL_ERROR, isValidEmail } from '@/lib/validation'
import { formatDateTime, relativeTime } from '@/lib/time'
import { showToast } from '@/lib/toast'

type PlatformStaff = components['schemas']['PlatformStaff']
type StaffStatus = 'invited' | 'active' | 'disabled'

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

const ALL_FLAGS = PERMISSION_GROUPS.flatMap((g) => g.flags)

const STATUS_META: Record<StaffStatus, { label: string; color: 'success' | 'warning' | 'secondary' }> = {
  invited: { label: 'Invited', color: 'warning' },
  active: { label: 'Active', color: 'success' },
  disabled: { label: 'Disabled', color: 'secondary' },
}

const STATUS_CHIPS: { key: StaffStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'invited', label: 'Invited' },
  { key: 'disabled', label: 'Disabled' },
]

// The `status` field is present on every row this console has ever seen, but typed optional
// server-side for callers that predate it — this is the one place that resolves it, the same way
// the mock server itself falls back for old records.
function staffStatus(staff: PlatformStaff): StaffStatus {
  return staff.status ?? (staff.active ? 'active' : 'disabled')
}

function has(staff: PlatformStaff, key: PlatformPermissionKey): boolean {
  return Boolean(staff.permissions?.[key])
}

// "All access" for Super Admin, a handful of names when only a few flags are on, the group names
// when those flags line up neatly with whole groups, and a plain count otherwise — never a wall of
// eighteen toggle states squeezed into a table cell.
function accessSummary(staff: PlatformStaff): string {
  if (staff.is_super_admin) return 'All access'
  const on = ALL_FLAGS.filter((f) => has(staff, f.key))
  if (on.length === 0) return 'No access yet'
  if (on.length <= 3) return on.map((f) => f.label).join(', ')
  const fullGroups = PERMISSION_GROUPS.filter((g) => g.flags.every((f) => has(staff, f.key)))
  const coveredByFullGroups = fullGroups.reduce((n, g) => n + g.flags.length, 0)
  if (fullGroups.length > 0 && fullGroups.length <= 3 && coveredByFullGroups === on.length) {
    return fullGroups.map((g) => g.title).join(', ')
  }
  return `${on.length} of ${ALL_FLAGS.length} areas`
}

function lastSignInLabel(staff: PlatformStaff): string {
  if (staffStatus(staff) === 'invited') {
    return staff.invited_at ? `Invited ${formatDateTime(staff.invited_at)}` : 'Invited'
  }
  return staff.last_sign_in_at ? relativeTime(staff.last_sign_in_at) : 'Never'
}

// Grouped checkboxes shared by the invite modal (choosing a starting set) and the drawer (editing
// a live account) — same groups, same layout, different backing state and Super Admin handling.
function PermissionGroups({
  isOn,
  onToggle,
  onToggleGroup,
  disabled,
}: {
  isOn: (key: PlatformPermissionKey) => boolean
  onToggle: (key: PlatformPermissionKey) => void
  onToggleGroup?: (group: (typeof PERMISSION_GROUPS)[number]) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-lg">
      {PERMISSION_GROUPS.map((group) => {
        const allOn = group.flags.every((flag) => isOn(flag.key))
        return (
          <section key={group.title} className="flex flex-col gap-sm">
            <div className="flex items-center justify-between border-b border-border pb-xs">
              <h3 className="text-caption font-medium uppercase tracking-wide text-text-secondary">{group.title}</h3>
              {onToggleGroup && !disabled && (
                <button
                  type="button"
                  onClick={() => onToggleGroup(group)}
                  className="text-caption font-medium text-primary hover:underline"
                >
                  {allOn ? 'Turn all off' : 'Turn all on'}
                </button>
              )}
            </div>
            {group.flags.map((flag) => (
              <div key={flag.key} className="flex items-start justify-between gap-md">
                <div className="min-w-0">
                  <p className="text-body-sm text-text-primary">{flag.label}</p>
                  <p className="text-caption text-text-secondary">{flag.hint}</p>
                </div>
                <Toggle checked={isOn(flag.key)} onChange={() => onToggle(flag.key)} disabled={disabled} label={flag.label} />
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}

// User-requested (2026-08-15) — "wherever there is add button, use popup, instead of inline
// form." Invite modal now also offers a starting set of permissions, so a new hire doesn't land
// with zero access and need a second trip to the drawer.
function InviteStaffModal({ onClose, onInvited }: { onClose: () => void; onInvited: (email: string) => void }) {
  const createStaff = useCreatePlatformStaff()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const emailError = email && !isValidEmail(email) ? EMAIL_ERROR : undefined
  const canSubmit = Boolean(name.trim() && email) && !emailError

  function toggle(key: PlatformPermissionKey) {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleGroup(group: (typeof PERMISSION_GROUPS)[number]) {
    const allOn = group.flags.every((f) => permissions[f.key])
    setPermissions((prev) => {
      const next = { ...prev }
      for (const f of group.flags) next[f.key] = !allOn
      return next
    })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    createStaff.mutate(
      { name: name.trim(), email, permissions },
      {
        onSuccess: () => {
          onInvited(email)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Invite staff"
      widthRem={30}
      footer={
        <>
          {createStaff.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{createStaff.error.message}</p>
          )}
          <Button type="submit" form="add-staff-form" loading={createStaff.isPending} disabled={!canSubmit}>
            Send invite
          </Button>
        </>
      }
    >
      <form id="add-staff-form" onSubmit={handleSubmit} className="flex flex-col gap-lg">
        <div className="flex flex-col gap-md">
          <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <TextField
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError}
          />
          <p className="text-caption text-text-secondary">
            They&rsquo;ll get an email with a link to set their own password. It works for 7 days.
          </p>
        </div>
        <div className="flex flex-col gap-sm">
          <p className="text-body-sm font-medium text-text-primary">Starting permissions</p>
          <p className="text-caption text-text-secondary">
            Optional — nothing selected means no access until you turn something on later.
          </p>
          <PermissionGroups
            isOn={(key) => Boolean(permissions[key])}
            onToggle={toggle}
            onToggleGroup={toggleGroup}
          />
        </div>
      </form>
    </Modal>
  )
}

function ReasonModal({
  title,
  description,
  confirmLabel,
  variant = 'primary',
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string
  description: string
  confirmLabel: string
  variant?: 'primary' | 'destructive'
  pending: boolean
  error?: string
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const reasonValid = reason.trim().length >= 3

  return (
    <Modal
      onClose={onClose}
      title={title}
      widthRem={26}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={variant} loading={pending} disabled={!reasonValid} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">{description}</p>
        <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <p className="text-body-sm text-error">{error}</p>}
      </div>
    </Modal>
  )
}

// The drawer's permission section: toggles are edited LOCALLY, not saved per click (user-
// requested) — a footer with a change count and a required reason appears once anything differs
// from what's saved, and Save sends one PATCH with just the changed keys.
function PermissionEditor({ staff }: { staff: PlatformStaff }) {
  const updatePermissions = useUpdatePlatformStaffPermissions(staff.id!)
  const [edits, setEdits] = useState<Record<string, boolean>>({})
  const [reason, setReason] = useState('')

  const isOn = (key: PlatformPermissionKey) => (key in edits ? edits[key] : has(staff, key))
  const changedKeys = Object.keys(edits).filter((k) => edits[k] !== has(staff, k as PlatformPermissionKey))
  const dirty = changedKeys.length > 0
  const reasonValid = reason.trim().length >= 3

  function setEdit(key: PlatformPermissionKey, value: boolean) {
    setEdits((prev) => {
      const next = { ...prev }
      if (value === has(staff, key)) delete next[key]
      else next[key] = value
      return next
    })
  }

  function toggle(key: PlatformPermissionKey) {
    setEdit(key, !isOn(key))
  }

  function toggleGroup(group: (typeof PERMISSION_GROUPS)[number]) {
    const allOn = group.flags.every((f) => isOn(f.key))
    for (const f of group.flags) setEdit(f.key, !allOn)
  }

  function handleDiscard() {
    setEdits({})
    setReason('')
  }

  function handleSave() {
    if (!dirty || !reasonValid) return
    const body: Record<string, boolean> & { reason: string } = { reason: reason.trim() }
    for (const key of changedKeys) body[key] = edits[key]
    updatePermissions.mutate(body, { onSuccess: handleDiscard })
  }

  return (
    <div className="flex flex-col gap-lg">
      {staff.is_super_admin ? (
        <>
          <p className="rounded-md border border-border bg-background p-sm text-body-sm text-text-secondary">
            Super Admins have every permission. This can&rsquo;t be changed.
          </p>
          <PermissionGroups isOn={() => true} onToggle={() => {}} disabled />
        </>
      ) : (
        <>
          <PermissionGroups isOn={isOn} onToggle={toggle} onToggleGroup={toggleGroup} />
          {updatePermissions.isError && <p className="text-body-sm text-error">{updatePermissions.error.message}</p>}
          {dirty && (
            <div className="flex flex-col gap-sm rounded-md border border-border bg-background p-sm">
              <p className="text-body-sm font-medium text-text-primary">
                {changedKeys.length} change{changedKeys.length === 1 ? '' : 's'}
              </p>
              <TextField
                label="Reason for the change"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex justify-end gap-sm">
                <Button variant="secondary" size="sm" onClick={handleDiscard} disabled={updatePermissions.isPending}>
                  Discard
                </Button>
                <Button size="sm" loading={updatePermissions.isPending} disabled={!reasonValid} onClick={handleSave}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DateRow({ label, iso }: { label: string; iso?: string | null }) {
  return (
    <div className="flex flex-col gap-xs">
      <span className="text-caption text-text-secondary">{label}</span>
      <span className="text-body-sm text-text-primary">{iso ? formatDateTime(iso) : '—'}</span>
    </div>
  )
}

function StaffDrawerBody({ staff, currentUserId }: { staff: PlatformStaff; currentUserId?: string }) {
  const resendInvite = useResendPlatformStaffInvite()
  const disableStaff = useDisablePlatformStaff()
  const enableStaff = useEnablePlatformStaff()
  const [confirmingDisable, setConfirmingDisable] = useState(false)
  const [confirmingEnable, setConfirmingEnable] = useState(false)
  const [resendDone, setResendDone] = useState(false)

  const status = staffStatus(staff)
  const isSelf = Boolean(currentUserId) && staff.user_id === currentUserId

  return (
    <div className="flex flex-col gap-lg">
      <div>
        <div className="flex flex-wrap items-center gap-sm">
          <h3 className="text-h3 text-text-primary">{staff.name}</h3>
          {staff.is_super_admin && <Badge color="primary">Super Admin</Badge>}
          <Badge color={STATUS_META[status].color}>{STATUS_META[status].label}</Badge>
        </div>
        <p className="text-body-sm text-text-secondary">{staff.email}</p>
      </div>

      <div className="grid grid-cols-2 gap-md rounded-md border border-border p-sm">
        <DateRow label="Invited" iso={staff.invited_at} />
        <DateRow label="Joined" iso={staff.joined_at} />
        <DateRow label="Last sign-in" iso={staff.last_sign_in_at} />
        {status === 'disabled' && <DateRow label="Disabled" iso={staff.disabled_at} />}
      </div>
      {status === 'disabled' && staff.disabled_reason && (
        <p className="text-body-sm text-text-secondary">
          <span className="font-medium text-text-primary">Reason: </span>
          {staff.disabled_reason}
        </p>
      )}

      <div className="flex flex-col gap-sm border-t border-border pt-md">
        <h4 className="text-body-sm font-medium text-text-primary">Access</h4>
        <PermissionEditor staff={staff} />
      </div>

      {staff.is_super_admin && (
        <div className="flex flex-col gap-sm border-t border-border pt-md">
          <h4 className="text-body-sm font-medium text-text-primary">Actions</h4>
          <p className="text-caption text-text-secondary">
            A Super Admin account can&rsquo;t be disabled or erased — by anyone, another Super Admin included.
          </p>
        </div>
      )}
      {!staff.is_super_admin && (
        <div className="flex flex-col gap-sm border-t border-border pt-md">
          <h4 className="text-body-sm font-medium text-text-primary">Actions</h4>
          <div className="flex flex-wrap gap-sm">
            {status === 'invited' && (
              <Button
                variant="secondary"
                size="sm"
                loading={resendInvite.isPending}
                onClick={() => resendInvite.mutate(staff.id!, { onSuccess: () => setResendDone(true) })}
              >
                Resend invite
              </Button>
            )}
            {status === 'disabled' ? (
              <Button variant="secondary" size="sm" onClick={() => setConfirmingEnable(true)}>
                Enable account
              </Button>
            ) : isSelf ? (
              <p className="text-caption text-text-secondary">You can&rsquo;t disable your own account.</p>
            ) : (
              <Button variant="destructive" size="sm" onClick={() => setConfirmingDisable(true)}>
                Disable account
              </Button>
            )}
          </div>
          {resendDone && <p className="text-caption text-success">Invite resent.</p>}
          {resendInvite.isError && <p className="text-caption text-error">{resendInvite.error.message}</p>}
        </div>
      )}

      {confirmingDisable && (
        <ReasonModal
          title="Disable account"
          description={`Disable ${staff.name}? They'll lose platform access immediately, and their session ends at once.`}
          confirmLabel="Disable"
          variant="destructive"
          pending={disableStaff.isPending}
          error={disableStaff.isError ? disableStaff.error.message : undefined}
          onClose={() => setConfirmingDisable(false)}
          onConfirm={(reason) =>
            disableStaff.mutate({ id: staff.id!, reason }, { onSuccess: () => setConfirmingDisable(false) })
          }
        />
      )}
      {confirmingEnable && (
        <ReasonModal
          title="Enable account"
          description={`Give ${staff.name} platform access again?`}
          confirmLabel="Enable"
          pending={enableStaff.isPending}
          error={enableStaff.isError ? enableStaff.error.message : undefined}
          onClose={() => setConfirmingEnable(false)}
          onConfirm={(reason) =>
            enableStaff.mutate({ id: staff.id!, reason }, { onSuccess: () => setConfirmingEnable(false) })
          }
        />
      )}
    </div>
  )
}

export function PlatformTeamPage() {
  const staff = usePlatformStaff()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [showAdd, setShowAdd] = useState(false)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StaffStatus | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const searched = useMemo(() => {
    let items = staff.data ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((s) => s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q))
    }
    return items
  }, [staff.data, search])

  const counts = useMemo(() => {
    const c: Record<StaffStatus | 'all', number> = { all: searched.length, active: 0, invited: 0, disabled: 0 }
    for (const s of searched) c[staffStatus(s)]++
    return c
  }, [searched])

  const rows = useMemo(() => {
    let items = searched
    if (statusFilter !== 'all') items = items.filter((s) => staffStatus(s) === statusFilter)
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        if (sort.field === 'last_sign_in') {
          const av = a.last_sign_in_at ?? ''
          const bv = b.last_sign_in_at ?? ''
          return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
        }
        const av = (a.name ?? '').toLowerCase()
        const bv = (b.name ?? '').toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [searched, statusFilter, sort])

  const selected = staff.data?.find((s) => s.id === selectedId) ?? null

  const columns: TableColumn<PlatformStaff>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (s) => (
        <div className="flex flex-col">
          <span className="flex items-center gap-xs font-medium text-text-primary">
            {s.name}
            {s.is_super_admin && <Badge color="primary">Super Admin</Badge>}
          </span>
          <span className="text-caption text-text-secondary">{s.email}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => {
        const status = staffStatus(s)
        return <Badge color={STATUS_META[status].color}>{STATUS_META[status].label}</Badge>
      },
    },
    { key: 'access', header: 'Access', render: (s) => <span className="text-text-secondary">{accessSummary(s)}</span> },
    {
      key: 'last_sign_in',
      header: 'Last sign-in',
      sortable: true,
      render: (s) => <span className="text-text-secondary">{lastSignInLabel(s)}</span>,
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
          <Button onClick={() => setShowAdd(true)}>Invite staff</Button>
        </div>

        {showAdd && (
          <InviteStaffModal
            onClose={() => setShowAdd(false)}
            onInvited={(email) => showToast(`Invite sent to ${email}`)}
          />
        )}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(s) => s.id!}
          loading={staff.isLoading}
          error={staff.isError ? 'Could not load platform staff.' : undefined}
          emptyMessage={
            search || statusFilter !== 'all'
              ? 'No staff match these filters.'
              : 'No platform staff yet. Invite a colleague with Invite staff above.'
          }
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search name or email…' }}
          onRowClick={(s) => setSelectedId(s.id!)}
          quickFilters={STATUS_CHIPS.map((chip) => (
            <FilterChip
              key={chip.key}
              label={`${chip.label} (${counts[chip.key]})`}
              active={statusFilter === chip.key}
              onChange={() => setStatusFilter(chip.key)}
            />
          ))}
        />

        <Drawer open={selected != null} onClose={() => setSelectedId(null)} title="Platform staff">
          {selected && <StaffDrawerBody key={selected.id} staff={selected} currentUserId={currentUserId} />}
        </Drawer>

      </div>
    </AdminShell>
  )
}

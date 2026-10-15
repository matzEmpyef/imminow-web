import { useMemo, useState } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { InviteEmployeeModal } from './InviteEmployeeModal'
import { EmployeeAccessModal } from './EmployeeAccessModal'
import { EditEmployeeModal } from './EditEmployeeModal'
import { EmployeeRemoveButton } from './EmployeeRemoveButton'
import { EmployeeSwitchOnButton } from './EmployeeSwitchOnButton'
import { employeeStanding, STANDING_BADGE, STANDING_LABEL } from '@/lib/employeeStanding'
import { useMeStaff } from '@/lib/me'
import { useFeature } from '@/lib/features'
import { useAccountWords } from '@/lib/accountWords'
import { useActiveEmployeeCount, useAllEmployees, useBranches, useDesignations } from '@/queries/staff'
import { CeilingCreateButton } from '@/components/CeilingCreateButton'
import type { components } from '@/api/schema'

type Employee = components['schemas']['Employee']

export function EmployeesPage() {
  // Designations & Access Rights (build reference 1.16 made real, 2026-08-29) — Starter's
  // "every employee has identical, full access" is a consequence of this flag being off, not of
  // the raw tier. Also gates invite-time access rights (InviteEmployeeModal) and the per-employee
  // branch checklist's designation half (EmployeeAccessModal).
  const hasDesignations = useFeature('designations')
  const hasMultiBranch = useFeature('multi_branch')
  const words = useAccountWords()
  // Everyone who has ever worked here, leavers included (`filter[active]=all`, lane x): the server
  // now hides deactivated staff unless asked, and this is the page where they are re-read. The
  // whole roster is loaded, page after page, so search and sort below cover all of it.
  const employees = useAllEmployees('all')
  const activeSeats = useActiveEmployeeCount()
  const designations = useDesignations()
  const branches = useBranches()
  // Whoever is using the console is not offered "Disable" on their own row.
  const myEmployeeId = useMeStaff()?.employee_id
  // "Manage Access" (the key icon on each row) exists only where there is something to manage.
  const hasAccessControls = hasDesignations || (hasMultiBranch && (branches.data?.length ?? 0) > 1)

  const [showInviteModal, setShowInviteModal] = useState(false)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    let items = employees.data?.items ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (e) =>
          `${e.user!.first_name} ${e.user!.last_name}`.toLowerCase().includes(q) ||
          (e.user!.email ?? '').toLowerCase().includes(q),
      )
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av = `${a.user!.first_name} ${a.user!.last_name}`.toLowerCase()
        const bv = `${b.user!.first_name} ${b.user!.last_name}`.toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [employees.data, search, sort])

  const columns: TableColumn<Employee>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (employee) => (
        <div className="flex flex-wrap items-center gap-sm">
          <span className="font-medium text-text-primary">
            {employee.user!.first_name} {employee.user!.last_name}
          </span>
          {employee.is_consultancy_admin && <Badge color="primary">Owner/Admin</Badge>}
          {/* Invited until they accept (T1-13): an invitation holds a seat but is not yet a colleague. */}
          <Badge color={STANDING_BADGE[employeeStanding(employee)]}>{STANDING_LABEL[employeeStanding(employee)]}</Badge>
          {/* The server switched them off when the invitation ran out, and the old link is dead. */}
          {employeeStanding(employee) === 'expired' && (
            <span className="text-caption text-text-secondary">
              An expired invitation cannot be switched back on. Send a new invitation instead.
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      // One column, email above phone (user, 2026-09-10) — same as the Clients list: they are read
      // together, and two columns spent the table's width on one piece of information.
      //
      // A row the server sent as a summary carries no contact details at all (lane x). That means
      // "not shown to you", never "this person has no email", so it is said in those words. This
      // page is for holders of "Manage employees", who get every row in full; the guard is for the
      // moment that permission has just been taken away.
      render: (employee) =>
        employee.detail === 'summary' ? (
          <span className="text-text-secondary">Not shown to you</span>
        ) : (
          <div className="flex flex-col">
            <span className="text-text-secondary">{employee.user!.email ?? '—'}</span>
            <span className="text-text-secondary">{employee.user!.phone ?? '—'}</span>
          </div>
        ),
    },
    {
      key: 'designation',
      header: 'Designation',
      // The access designation the person holds (T4-22). It was the free-text job title, blank for
      // anyone who was not invited with one, while the next column named the real one.
      render: (employee) => {
        if (employee.detail === 'summary') return <span className="text-text-secondary">Not shown to you</span>
        const held = designations.data?.find((d) => d.id === employee.designation_id)?.name
        return (
          <span className="text-text-secondary">
            {employee.is_consultancy_admin
              ? 'Full access (owner)'
              : (held ?? employee.user!.designation ?? (hasDesignations ? 'No access rights' : '—'))}
          </span>
        )
      },
    },
    // The branch half of this column is only worth a column when there is more than one branch to
    // be in — same test the Manage Access trigger below uses, so the column and the control that
    // edits it appear together.
    ...(hasAccessControls
      ? [
          {
            key: 'access',
            header: 'Branch',
            render: (employee: Employee) => {
              // The primary is named as such (2026-09-21) — it is a chosen fact now, not a
              // position in a list, and it decides which branch this person's cases are filed
              // under. Falls back the way the server does when none was ever picked.
              const primaryId = employee.primary_branch_id ?? employee.branch_ids?.[0]
              const branchNames = (branches.data ?? [])
                .filter((b) => employee.branch_ids?.includes(b.id!))
                .map((b) => (b.id === primaryId ? `${b.name} (primary)` : b.name))
              // A summary row has no access rights in it: "not shown", never "none" (lane x).
              if (employee.detail === 'summary') {
                return <span className="text-text-secondary">Not shown to you</span>
              }
              return (
                <span className="text-text-secondary">
                  {/* The owner carries every permission by definition — `usePermissionChecker`
                      bypasses to true for them, whether or not a designation row happens to be
                      attached. An institute (which has no designations at all) therefore showed
                      its owner as having "No access rights" (console review M3, 2026-09-13), and
                      a consultancy showed the protected "Owner/Admin" designation, repeating the
                      badge already on the Name cell. One honest answer for both. */}
                  {branchNames.length > 0
                    ? branchNames.join(', ')
                    : employee.is_consultancy_admin
                      ? 'Every branch (owner)'
                      : '—'}
                </span>
              )
            },
          } satisfies TableColumn<Employee>,
        ]
      : []),
    {
      key: 'actions',
      header: '',
      // Nothing to edit on a summary row: its details were not sent, and the server would refuse.
      render: (employee) => employee.detail === 'summary' ? null : (
        <div className="flex justify-end">
          <EditEmployeeModal
            employee={employee}
            designations={designations.data ?? []}
            hasDesignations={hasDesignations}
            hasAccessControls={hasAccessControls}
          />
          {/* Branches moved to Starter on 2026-09-21, which left this modal — the ONLY place an
              employee's branches can be changed — behind the `designations` entitlement. An account
              could then have branches, a branch picker on every lead, and no way to put anybody in
              one. It now opens for either half, and each half renders only if its own feature is on. */}
          {hasAccessControls && !employee.is_consultancy_admin && (
              <EmployeeAccessModal
                employee={employee}
                designations={designations.data ?? []}
                branches={branches.data ?? []}
                hasMultiBranch={hasMultiBranch}
                hasDesignations={hasDesignations}
              />
            )}
          {/* On every plan, not only where Manage Access exists (T1-13). */}
          {!employee.is_consultancy_admin && employee.active && employee.id !== myEmployeeId && (
            <EmployeeRemoveButton employee={employee} />
          )}
          {/* Someone who worked here and was disabled. An expired invitation has no account to switch
              back on, so it offers the normal invitation instead. */}
          {!employee.is_consultancy_admin && employeeStanding(employee) === 'disabled' && (
            <EmployeeSwitchOnButton employee={employee} />
          )}
          {employeeStanding(employee) === 'expired' && (
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="rounded-md px-sm text-body-sm font-medium text-primary hover:bg-primary/10"
            >
              Invite again
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Employees</h1>
            <p className="text-body-sm text-text-secondary">
              {hasDesignations
                ? 'Each person’s access comes from their designation. You can also change an individual person’s access.'
                : words.isInstitute
                  ? 'Everyone on this plan has the same access.'
                  : 'Everyone on this plan has the same access. Commission details are visible only to the administrator.'}
            </p>
          </div>
          {/* The seat count against the plan's limit, and off with the reason at the limit, so the
              form is not filled in only to be refused (improvement I-076). */}
          <CeilingCreateButton kind="seats" count={activeSeats.data} onClick={() => setShowInviteModal(true)}>
            Invite Employee
          </CeilingCreateButton>
        </div>

        {showInviteModal && (
          <InviteEmployeeModal
            hasDesignations={hasDesignations}
            designations={designations.data ?? []}
            branches={branches.data ?? []}
            hasMultiBranch={hasMultiBranch}
            onClose={() => setShowInviteModal(false)}
          />
        )}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(employee) => employee.id!}
          loading={employees.isLoading}
          error={employees.isError ? 'Could not load employees.' : undefined} errorSource={employees.error}
          emptyMessage={
            search
              ? 'No employees match your search.'
              : // L1 (2026-09-13): "employee" is the record, and the ROLE word is whatever this
                // account calls the people who carry leads and cases — a college's staff are team
                // members, not consultants.
                `No employees yet. Invite your first ${words.person} with Invite Employee above.`
          }
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search employees…' }}
        />
      </div>
    </AppShell>
  )
}

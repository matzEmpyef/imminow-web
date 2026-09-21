import { useMemo, useState } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { InviteEmployeeModal } from './InviteEmployeeModal'
import { EmployeeAccessModal } from './EmployeeAccessModal'
import { EditEmployeeModal } from './EditEmployeeModal'
import { useFeature } from '@/lib/features'
import { useAccountWords } from '@/lib/accountWords'
import { useBranches, useDesignations, useEmployees } from '@/queries/staff'
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
  const employees = useEmployees()
  const designations = useDesignations()
  const branches = useBranches()

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
        <div className="flex items-center gap-sm">
          <span className="font-medium text-text-primary">
            {employee.user!.first_name} {employee.user!.last_name}
          </span>
          {employee.is_consultancy_admin && <Badge color="primary">Owner/Admin</Badge>}
          <Badge color={employee.active ? 'success' : 'secondary'}>{employee.active ? 'Active' : 'Disabled'}</Badge>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      // One column, email above phone (user, 2026-09-10) — same as the Clients list: they are read
      // together, and two columns spent the table's width on one piece of information.
      render: (employee) => (
        <div className="flex flex-col">
          <span className="text-text-secondary">{employee.user!.email}</span>
          <span className="text-text-secondary">{employee.user!.phone ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'designation',
      header: 'Designation',
      render: (employee) => <span className="text-text-secondary">{employee.user!.designation ?? '—'}</span>,
    },
    // The branch half of this column is only worth a column when there is more than one branch to
    // be in — same test the Manage Access trigger below uses, so the column and the control that
    // edits it appear together.
    ...(hasDesignations || (hasMultiBranch && (branches.data?.length ?? 0) > 1)
      ? [
          {
            key: 'access',
            header: hasDesignations ? 'Access Rights / Branch' : 'Branch',
            render: (employee: Employee) => {
              const designation = designations.data?.find((d) => d.id === employee.designation_id)
              // The primary is named as such (2026-09-21) — it is a chosen fact now, not a
              // position in a list, and it decides which branch this person's cases are filed
              // under. Falls back the way the server does when none was ever picked.
              const primaryId = employee.primary_branch_id ?? employee.branch_ids?.[0]
              const branchNames = (branches.data ?? [])
                .filter((b) => employee.branch_ids?.includes(b.id!))
                .map((b) => (b.id === primaryId ? `${b.name} (primary)` : b.name))
              return (
                <span className="text-text-secondary">
                  {/* The owner carries every permission by definition — `usePermissionChecker`
                      bypasses to true for them, whether or not a designation row happens to be
                      attached. An institute (which has no designations at all) therefore showed
                      its owner as having "No access rights" (console review M3, 2026-09-13), and
                      a consultancy showed the protected "Owner/Admin" designation, repeating the
                      badge already on the Name cell. One honest answer for both. */}
                  {hasDesignations
                    ? employee.is_consultancy_admin
                      ? 'Full access (owner)'
                      : (designation?.name ?? 'No access rights')
                    : ''}
                  {branchNames.length > 0 ? `${hasDesignations ? ' · ' : ''}${branchNames.join(', ')}` : ''}
                  {!hasDesignations && branchNames.length === 0
                    ? employee.is_consultancy_admin
                      ? 'Every branch (owner)'
                      : '—'
                    : ''}
                </span>
              )
            },
          } satisfies TableColumn<Employee>,
        ]
      : []),
    {
      key: 'actions',
      header: '',
      render: (employee) => (
        <div className="flex justify-end">
          <EditEmployeeModal employee={employee} designations={designations.data ?? []} />
          {/* Branches moved to Starter on 2026-09-21, which left this modal — the ONLY place an
              employee's branches can be changed — behind the `designations` entitlement. An account
              could then have branches, a branch picker on every lead, and no way to put anybody in
              one. It now opens for either half, and each half renders only if its own feature is on. */}
          {(hasDesignations || (hasMultiBranch && (branches.data?.length ?? 0) > 1)) &&
            !employee.is_consultancy_admin && (
              <EmployeeAccessModal
                employee={employee}
                designations={designations.data ?? []}
                branches={branches.data ?? []}
                hasMultiBranch={hasMultiBranch}
                hasDesignations={hasDesignations}
              />
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
                ? 'Each employee has a designation baseline plus optional individual overrides.'
                : 'Every employee has identical, full access on this plan.'}
            </p>
          </div>
          <Button onClick={() => setShowInviteModal(true)}>Invite Employee</Button>
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
          error={employees.isError ? 'Could not load employees.' : undefined}
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

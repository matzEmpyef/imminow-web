import { useMemo, useState } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { InviteEmployeeModal } from './InviteEmployeeModal'
import { EmployeeAccessModal } from './EmployeeAccessModal'
import { EditEmployeeModal } from './EditEmployeeModal'
import { useMyConsultancy } from '@/queries/consultancy'
import { useBranches, useDesignations, useEmployees } from '@/queries/staff'
import type { components } from '@/api/schema'

type Employee = components['schemas']['Employee']
type Tier = 'starter' | 'business' | 'ultimate'

export function EmployeesPage() {
  const { data: consultancy } = useMyConsultancy()
  const tier = (consultancy?.tier ?? 'starter') as Tier
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
          e.user!.email.toLowerCase().includes(q),
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
      key: 'email',
      header: 'Email',
      render: (employee) => <span className="text-text-secondary">{employee.user!.email}</span>,
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (employee) => <span className="text-text-secondary">{employee.user!.phone ?? '—'}</span>,
    },
    {
      key: 'designation',
      header: 'Designation',
      render: (employee) => <span className="text-text-secondary">{employee.user!.designation ?? '—'}</span>,
    },
    ...(tier !== 'starter'
      ? [
          {
            key: 'access',
            header: 'Access Rights / Branch',
            render: (employee: Employee) => {
              const designation = designations.data?.find((d) => d.id === employee.designation_id)
              const branchNames = (branches.data ?? [])
                .filter((b) => employee.branch_ids?.includes(b.id!))
                .map((b) => b.name)
              return (
                <span className="text-text-secondary">
                  {designation?.name ?? 'No access rights'}
                  {branchNames.length > 0 ? ` · ${branchNames.join(', ')}` : ''}
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
          <EditEmployeeModal employee={employee} />
          {tier !== 'starter' && !employee.is_consultancy_admin && (
            <EmployeeAccessModal
              employee={employee}
              designations={designations.data ?? []}
              branches={branches.data ?? []}
              tier={tier}
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
              {tier === 'starter'
                ? 'Starter plan: every employee has identical, full access.'
                : 'Each employee has a designation baseline plus optional individual overrides.'}
            </p>
          </div>
          <Button onClick={() => setShowInviteModal(true)}>Invite Employee</Button>
        </div>

        {showInviteModal && (
          <InviteEmployeeModal
            tier={tier}
            designations={designations.data ?? []}
            onClose={() => setShowInviteModal(false)}
          />
        )}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(employee) => employee.id!}
          loading={employees.isLoading}
          emptyMessage="No employees yet."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search employees…' }}
        />
      </div>
    </AppShell>
  )
}

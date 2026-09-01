import { useMemo, useState } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { CreateDesignationModal } from './CreateDesignationModal'
import { DesignationPermissionsModal } from './DesignationPermissionsModal'
import { useDesignations } from '@/queries/staff'
import type { components } from '@/api/schema'

type Designation = components['schemas']['Designation']

export function DesignationsPage() {
  const designations = useDesignations()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    let items = designations.data ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((d) => d.name.toLowerCase().includes(q))
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av = a.name.toLowerCase()
        const bv = b.name.toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [designations.data, search, sort])

  const columns: TableColumn<Designation>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (d) => (
        <div className="flex items-center gap-sm">
          <span className="font-medium text-text-primary">{d.name}</span>
          {d.protected && <Badge color="secondary">System-protected</Badge>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (d) =>
        !d.protected && (
          <div className="flex justify-end">
            <DesignationPermissionsModal designation={d} />
          </div>
        ),
    },
  ]

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Designations</h1>
            <p className="text-body-sm text-text-secondary">
              Named permission templates — assign one to each employee, then override individual permissions if needed.
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>New Designation</Button>
        </div>

        {showCreateModal && <CreateDesignationModal onClose={() => setShowCreateModal(false)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(d) => d.id!}
          loading={designations.isLoading}
          error={designations.isError ? 'Could not load designations.' : undefined}
          emptyMessage="No designations yet."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search designations…' }}
        />
      </div>
    </AppShell>
  )
}

import { useMemo, useState } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { CreateDesignationModal } from './CreateDesignationModal'
import { DesignationPermissionsModal } from './DesignationPermissionsModal'
import { useDesignations } from '@/queries/staff'
import { useAccountWords } from '@/lib/accountWords'
import type { components } from '@/api/schema'

type Designation = components['schemas']['Designation']

// Not a real designation id — the marker for the synthetic built-in row below, which the Name
// column greys and the actions column leaves empty.
const BUILT_IN_ID = 'built-in'

export function DesignationsPage() {
  const designations = useDesignations()
  const words = useAccountWords()
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

  // An account that has added none of its own — every institute today — saw a bare "No
  // designations yet" and nothing else (console review M11, 2026-09-13), which reads as an
  // account with NO ROLES AT ALL rather than one running on the built-in owner role. So the
  // built-in role is listed, greyed and without an Edit affordance: it carries every permission
  // by definition, so there is genuinely nothing to edit. A synthetic row rather than a separate
  // card, because it belongs in the same list the real designations will join.
  const showBuiltIn = !search && !designations.isLoading && !designations.isError && rows.length === 0
  const builtInRows: Designation[] = [
    {
      id: BUILT_IN_ID,
      name: words.isInstitute ? 'Institute Admin (built in)' : 'Owner/Admin (built in)',
      protected: true,
      permissions: {},
    },
  ]

  const columns: TableColumn<Designation>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (d) =>
        d.id === BUILT_IN_ID ? (
          <span className="text-text-secondary">{d.name}</span>
        ) : (
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
          rows={showBuiltIn ? builtInRows : rows}
          rowKey={(d) => d.id!}
          loading={designations.isLoading}
          error={designations.isError ? 'Could not load designations.' : undefined}
          emptyMessage={
            search
              ? 'No designations match your search.'
              : 'No designations yet. Create one to set a baseline of permissions for a role.'
          }
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search designations…' }}
        />

        {showBuiltIn && (
          <p className="text-caption text-text-secondary">
            The owner role is built in; add designations to give staff narrower access.
          </p>
        )}
      </div>
    </AppShell>
  )
}

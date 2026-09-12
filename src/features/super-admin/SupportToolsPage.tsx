import { useMemo, useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { StopPropagation } from '@/components/StopPropagation'
import { Table, type TableColumn } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { useUserSearch, type UserSearchResult } from '@/queries/supportTools'
import { UserActionsModal } from './support-tools/UserActionsModal'

/**
 * Support Tools (rebuilt 2026-09-12) — search any user by name or email, then act on their
 * account through a focused popup rather than a bare row of icons. Results deliberately show
 * name, contact, case stage and consultancy only — not commission figures or documents.
 */
export function SupportToolsPage() {
  const [search, setSearch] = useState('')
  const paging = useCursorPagination()
  const results = useUserSearch(search, paging.cursor, 20)
  const [actionsFor, setActionsFor] = useState<UserSearchResult | null>(null)

  const rows = useMemo(() => results.data?.items ?? [], [results.data])

  const columns: TableColumn<UserSearchResult>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (result) => {
        const consent = result.guardian_consent
        const guardianRelevant = result.role === 'student' && Boolean(consent) && consent!.status !== 'not_required'
        return (
          <div className="flex flex-wrap items-center gap-sm">
            <span className="font-medium text-text-primary">{result.name}</span>
            <Badge color="primary" className="capitalize">
              {result.role.replace(/_/g, ' ')}
            </Badge>
            {result.case_stage && (
              <Badge color="info" className="capitalize">
                {result.case_stage.replace(/_/g, ' ')}
              </Badge>
            )}
            {guardianRelevant && (
              <Badge color={consent!.status === 'approved' ? 'success' : 'warning'} className="capitalize">
                Guardian {consent!.status.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      key: 'contact',
      header: 'Contact',
      hideBelow: 'sm',
      render: (result) => (
        <span className="text-text-secondary">
          {result.email}
          {result.phone ? ` · ${result.phone}` : ''}
        </span>
      ),
    },
    {
      key: 'consultancy',
      header: 'Consultancy',
      hideBelow: 'md',
      render: (result) => result.consultancy_name ?? <span className="text-text-secondary">—</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (result) => (
        <StopPropagation>
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => setActionsFor(result)}>
              Actions
            </Button>
          </div>
        </StopPropagation>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Support Tools</h1>
          <p className="text-body-sm text-text-secondary">
            Search any user by name or email — students, staff, and freelancers. Results show name, contact, and case
            stage only, deliberately not commission figures or documents.
          </p>
        </div>

        <Table
          columns={columns}
          rows={rows}
          rowKey={(result) => result.id}
          loading={results.isLoading}
          error={results.isError ? 'Could not run this search.' : undefined}
          emptyMessage={search.trim().length < 2 ? 'Type at least two characters to search.' : `No matches for "${search}".`}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              paging.reset()
              // A stale Actions panel left open across a new search (2026-09-12, product review
              // H8) risks acting on whoever was open rather than whoever is now on screen.
              setActionsFor(null)
            },
            placeholder: 'Search by name or email…',
          }}
          pagination={{
            hasNext: Boolean(results.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => results.data?.meta.next_cursor && paging.next(results.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: results.data?.meta.total,
          }}
        />
      </div>

      {actionsFor && <UserActionsModal result={actionsFor} onClose={() => setActionsFor(null)} />}
    </AdminShell>
  )
}

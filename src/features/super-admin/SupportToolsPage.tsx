import { useMemo, useState } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { StopPropagation } from '@/components/StopPropagation'
import { Table, type TableColumn } from '@/components/Table'
import { useCursorPagination } from '@/lib/pagination'
import { useUserSearch, type UserSearchResult } from '@/queries/supportTools'
import { UserActionsModal } from './support-tools/UserActionsModal'

// What the search box matches, in words — shared by the intro, the placeholder-adjacent empty states.
const SEARCH_RULE = 'an exact email or phone number, the first 3 or more letters of a name, or the start of a file number'

/**
 * Support Tools (rebuilt 2026-09-12) — search any user, then act on their account through a
 * focused popup rather than a bare row of icons. Results deliberately show name, contact, case
 * stage and consultancy only — not commission figures or documents.
 *
 * What a search matches (contract gate 12, F35 — the production backend's rule, which the page's
 * words must teach, since a loose substring box is what people expect): an email or phone EXACTLY,
 * a file number by its start, a name by its start and only from 3 characters. Platform staff never
 * come back (they live on Platform Team). The frozen mock still substring-scans everyone, so against
 * it a looser search happens to work; the copy describes the real rule.
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
            Find a student, consultancy staff member or freelancer by {SEARCH_RULE}. Platform staff are managed on
            Platform Team and never appear here. Results show name, contact, and case stage only, deliberately not
            commission figures or documents.
          </p>
        </div>

        <Table
          columns={columns}
          rows={rows}
          rowKey={(result) => result.id}
          loading={results.isLoading}
          error={results.isError ? 'Could not run this search.' : undefined}
          emptyMessage={
            search.trim().length < 2
              ? `Search by ${SEARCH_RULE}.`
              : search.trim().length < 3
                ? `No exact email, phone or file-number match for "${search.trim()}". A name needs at least 3 letters.`
                : `No matches for "${search.trim()}". Email and phone must match exactly; a name or file number matches from its start.`
          }
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              paging.reset()
              // A stale Actions panel left open across a new search (2026-09-12, product review
              // H8) risks acting on whoever was open rather than whoever is now on screen.
              setActionsFor(null)
            },
            placeholder: 'Email, phone, name (3+ letters) or file number…',
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

import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { useDebouncedValue } from '@/lib/useDebounce'

export interface TableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  hideBelow?: 'sm' | 'md' | 'lg'
}

interface TableSort {
  field: string
  direction: 'asc' | 'desc'
}

interface TablePagination {
  hasNext: boolean
  hasPrevious: boolean
  onNext: () => void
  onPrevious: () => void
  total?: number | null
}

interface TableSelection {
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll?: (ids: string[]) => void
}

interface TableExpandable<T> {
  isExpanded: (row: T) => boolean
  renderExpanded: (row: T) => ReactNode
}

interface TableProps<T> {
  columns: TableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  error?: ReactNode
  emptyMessage?: string
  sort?: TableSort | null
  onSortChange?: (field: string, direction: 'asc' | 'desc') => void
  search?: { value: string; onChange: (debounced: string) => void; placeholder?: string }
  filters?: ReactNode
  pagination?: TablePagination
  selection?: TableSelection
  expandable?: TableExpandable<T>
  onRowClick?: (row: T) => void
  bare?: boolean
  rowClassName?: (row: T) => string | undefined
}

const ALIGN_CLASS = { left: 'text-left', right: 'text-right', center: 'text-center' } as const
const HIDE_BELOW_CLASS = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' } as const

// Shared list-view primitive (build reference platform-wide-consistency principle — user-
// requested: "tables in all the List view... responsive... pagination... sortable... search...
// relevant filters"). Presentational only: never fetches, never owns filter state — a page keeps
// its own filter useState (same pattern AuditLogPage.tsx already used before this) and renders
// controls into the `filters` slot; sort-toggle cycling and the search debounce live here so
// every future page gets them for free instead of reimplementing per page.
//
// Search/filters/table/pagination all live inside one card (user-requested: "put table, search,
// filter, pagination everything inside a card. Not as separate things") — a single
// rounded-lg/bg-surface/shadow-card shell with border-b/border-t dividers between sections,
// instead of the search bar floating above a separate card.
//
// `bare` (user-requested, 2026-08-17 — "leaderboard - do not put it inside card") drops that
// outer shell for the one legitimate exception: Table nested inside a Modal, which already
// supplies its own rounded/bg-surface/shadow-card chrome — without `bare` the two stack into a
// visible card-inside-a-card. The border-b/border-t section dividers stay either way.
export function Table<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  emptyMessage = 'No results.',
  sort,
  onSortChange,
  search,
  filters,
  pagination,
  selection,
  expandable,
  onRowClick,
  bare,
  rowClassName,
}: TableProps<T>) {
  const [searchDraft, setSearchDraft] = useState(search?.value ?? '')
  const debouncedSearch = useDebouncedValue(searchDraft)

  useEffect(() => {
    if (!search) return
    search.onChange(debouncedSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the debounced value should retrigger this
  }, [debouncedSearch])

  function handleSort(column: TableColumn<T>) {
    if (!column.sortable || !onSortChange) return
    const nextDirection: 'asc' | 'desc' = sort?.field === column.key && sort.direction === 'asc' ? 'desc' : 'asc'
    onSortChange(column.key, nextDirection)
  }

  const allRowIds = rows.map(rowKey)
  const allSelected = selection ? allRowIds.length > 0 && allRowIds.every((id) => selection.selectedIds.has(id)) : false
  const hasMultiplePages = Boolean(pagination?.hasNext || pagination?.hasPrevious)

  return (
    <div className={bare ? '' : 'overflow-hidden rounded-lg bg-surface p-8 shadow-card'}>
      {(search || filters) && (
        <div className="flex flex-wrap items-center gap-sm border-b border-border p-md">
          <div className="flex min-w-0 flex-1 items-center">
            {search && (
              <input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder={search.placeholder ?? 'Search…'}
                style={{ maxWidth: '20rem' }}
                className="h-10 w-full rounded-full border border-border bg-background px-md text-body-sm text-text-primary outline-none focus:border-2 focus:border-primary"
              />
            )}
          </div>
          {filters && <div className="flex flex-wrap items-center gap-sm">{filters}</div>}
        </div>
      )}

      <div className="overflow-x-auto py-sm">
        <table className="w-full text-body-sm">
          <thead className="bg-background text-caption text-text-secondary">
            <tr>
              {selection && (
                <th className="w-10 px-md py-sm">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => selection.onToggleAll?.(allSelected ? [] : allRowIds)}
                    aria-label="Select all"
                    className="h-4 w-4"
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-md py-sm font-medium ${ALIGN_CLASS[column.align ?? 'left']} ${
                    column.hideBelow ? HIDE_BELOW_CLASS[column.hideBelow] : ''
                  }`}
                  aria-sort={
                    sort?.field === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                >
                  {/* Sorting happens through a real <button> so it's keyboard-operable — a bare
                      onClick on the <th> was mouse-only (accessibility re-audit, 2026-08-25).
                      aria-sort stays on the <th>, where the ARIA spec expects it. */}
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => handleSort(column)}
                      className="cursor-pointer select-none font-medium hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {column.header}
                      {sort?.field === column.key && (
                        <span className="ml-xs">{sort.direction === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={columns.length + (selection ? 1 : 0)} className="px-md py-md text-text-secondary">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={columns.length + (selection ? 1 : 0)} className="px-md py-md text-error">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (selection ? 1 : 0)} className="px-md py-md text-text-secondary">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              rows.map((row, i) => {
                const id = rowKey(row)
                const expanded = expandable?.isExpanded(row) ?? false
                return (
                  <Fragment key={id}>
                    {/* Click/keyboard handlers attach ONLY when the caller passes onRowClick — the
                        old unconditional onClick was why every action cell needed a defensive
                        stopPropagation wrapper even on tables with no row click at all. Clickable
                        rows are focusable and Enter/Space-activatable (Space preventDefaults so
                        the page doesn't scroll); handlers fired from inside a cell's own controls
                        are stopped by StopPropagation.tsx at those call sites. */}
                    <tr
                      className={`${i > 0 ? 'border-t border-border' : ''} ${
                        onRowClick
                          ? 'cursor-pointer hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary'
                          : ''
                      } ${rowClassName?.(row) ?? ''}`}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      tabIndex={onRowClick ? 0 : undefined}
                      aria-expanded={onRowClick && expandable ? expanded : undefined}
                      onKeyDown={
                        onRowClick
                          ? (e) => {
                              if (e.target !== e.currentTarget) return
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                onRowClick(row)
                              }
                            }
                          : undefined
                      }
                    >
                      {selection && (
                        <td className="px-md py-xs" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selection.selectedIds.has(id)}
                            onChange={() => selection.onToggle(id)}
                            aria-label={`Select row ${id}`}
                            className="h-4 w-4"
                          />
                        </td>
                      )}
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={`px-md py-xs text-text-primary ${ALIGN_CLASS[column.align ?? 'left']} ${
                            column.hideBelow ? HIDE_BELOW_CLASS[column.hideBelow] : ''
                          }`}
                        >
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                    {expandable && expanded && (
                      <tr className="border-t border-border bg-background">
                        <td colSpan={columns.length + (selection ? 1 : 0)} className="px-md py-md">
                          {expandable.renderExpanded(row)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
          </tbody>
        </table>
      </div>

      {pagination && (pagination.total != null || hasMultiplePages) && (
        <div className="flex items-center justify-between border-t border-border px-md py-xs">
          <span className="text-caption text-text-secondary">
            {pagination.total != null ? `${pagination.total} results` : ''}
          </span>
          {hasMultiplePages && (
            <div className="flex gap-xs">
              <Button variant="secondary" size="sm" disabled={!pagination.hasPrevious} onClick={pagination.onPrevious}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={!pagination.hasNext} onClick={pagination.onNext}>
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { StopPropagation } from '@/components/StopPropagation'
import { useAdminColleges, useImportColleges } from '@/queries/adminColleges'
import { CollegeFormModal } from './CollegeFormModal'
import { useCountries } from '@/queries/countries'
import { useCursorPagination } from '@/lib/pagination'
import type { components } from '@/api/schema'
import { FilterMultiSelect } from '@/components/FilterMultiSelect'
import { CountryLabel } from '@/components/CountryLabel'
import { CompactSelect } from '@/components/CompactSelect'
import { Card } from '@/components/Card'

type College = components['schemas']['College']

// User-requested (2026-08-18) — "expand and collapse is not a good method, as there could be
// thousands of colleges and campus... remember there will be min 10K colleges or more." The old
// page fetched every college with campuses embedded via one unpaginated call and built a fully
// client-side country->state->college tree with expand/collapse Cards — unworkable past a few
// dozen colleges, and it silently assumed one college = one country (grouped by the first
// campus), which was never true for a multi-campus college. Replaced with the same paginated/
// searchable/filterable Table primitive every other list page in this app already uses
// (build reference 1.11); a college's campuses and courses now live entirely on its own detail
// page (CollegeDetailPage.tsx) rather than nested inline here. GET /colleges list rows return
// campus_count/course_count instead of embedding full campus objects — see mock-server/server.js.
type ImportResult = NonNullable<ReturnType<typeof useImportColleges>['data']>

// What an import did, row by row (2026-09-11). It used to say only how many colleges it created,
// so a skipped or broken row simply vanished.
function ImportResultPanel({ result, onDismiss }: { result: ImportResult; onDismiss: () => void }) {
  const problems = (result.rows ?? []).filter((r) => r.status !== 'created')
  return (
    <Card className="flex flex-col gap-sm">
      <div className="flex items-start justify-between gap-md">
        <div>
          <p className="text-body-sm font-medium text-text-primary">
            Imported {result.created_count} college{result.created_count === 1 ? '' : 's'}
            {problems.length > 0 ? `, skipped ${problems.length}` : ''}.
          </p>
          {result.created_count > 0 && (
            <p className="text-caption text-text-secondary">
              Consultancy admins have been told, so they can add them as partner colleges.
            </p>
          )}
        </div>
        <Button variant="secondary" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      {problems.length > 0 && (
        <ul className="flex flex-col gap-xs text-caption text-text-secondary">
          {problems.map((r) => (
            <li key={r.row_number}>
              <span className="font-medium text-text-primary">Line {r.row_number}</span>
              {r.college_name ? ` — ${r.college_name}` : ''}: {(r.errors ?? []).join(' ')}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function CollegesCoursesPage() {
  const navigate = useNavigate()
  // Read once on mount so a deep link — Needs attention's "Courses missing entry requirements"
  // card — lands pre-filtered to Needs details, same one-way convention Finance Dashboard uses.
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('')
  const [healthFilter, setHealthFilter] = useState<'' | 'needs_details' | 'complete'>(() => {
    const fromUrl = searchParams.get('health')
    return fromUrl === 'needs_details' || fromUrl === 'complete' ? fromUrl : ''
  })
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const paging = useCursorPagination()
  // Disabled countries included (review C6, 2026-09-12) — a college can have campuses in a
  // country switched off after the fact, and this filter needs to keep finding it.
  const countries = useCountries({ includeInactive: true })

  const colleges = useAdminColleges({
    search: search || undefined,
    country: countryFilter.length ? countryFilter : undefined,
    active: statusFilter ? statusFilter === 'active' : undefined,
    health: healthFilter || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })
  const importColleges = useImportColleges()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showAddCollege, setShowAddCollege] = useState(false)
  const [editingCollege, setEditingCollege] = useState<College | null>(null)
  const summary = colleges.data?.summary
  const completePercent =
    summary && summary.course_count > 0 ? Math.round((summary.complete_course_count / summary.course_count) * 100) : null

  function resetPaging() {
    paging.reset()
  }

  function handleImportClick() {
    importColleges.reset()
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) importColleges.mutate(file)
    e.target.value = ''
  }

  const columns: TableColumn<College>[] = [
    {
      key: 'name',
      header: 'College',
      sortable: true,
      render: (college) => (
        <div className="flex items-center gap-sm">
          {college.logo_url ? (
            <img src={college.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover bg-background" />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-md bg-background" />
          )}
          <div className="min-w-0">
            <p className="font-medium text-text-primary">{college.name}</p>
            <Badge color={college.active ? 'success' : 'secondary'}>{college.active ? 'Active' : 'Inactive'}</Badge>
          </div>
        </div>
      ),
    },
    {
      // Where it is, from its campuses (2026-09-11) — country was only a filter before.
      key: 'location',
      header: 'Location',
      hideBelow: 'md',
      render: (college) =>
        college.countries?.length ? (
          <div className="flex flex-col">
            <span className="text-body-sm text-text-primary">{college.countries.join(', ')}</span>
            {college.regions && college.regions.length > 0 && (
              <span className="text-caption text-text-secondary">{college.regions.join(', ')}</span>
            )}
          </div>
        ) : (
          <span className="text-caption text-text-secondary">No campus yet</span>
        ),
    },
    {
      key: 'campus_count',
      header: 'Campuses',
      sortable: true,
      align: 'right',
      hideBelow: 'lg',
      render: (college) => college.campus_count ?? 0,
    },
    {
      key: 'course_count',
      header: 'Courses',
      sortable: true,
      align: 'right',
      render: (college) => college.course_count ?? 0,
    },
    {
      // Consultancies that list this college as a partner (2026-09-11) — which colleges actually
      // matter to the people who use the catalogue.
      key: 'partner_consultancy_count',
      header: 'Partner consultancies',
      sortable: true,
      align: 'right',
      render: (college) => college.partner_consultancy_count ?? 0,
    },
    {
      // Catalog-health rollup (COURSES_MODULE_PLAN.md §5) — server-counted against the same five
      // capture checks the per-course meter runs. Hovering names the checks that fall short.
      key: 'catalog_health',
      header: 'Catalog health',
      sortable: true,
      align: 'right',
      hideBelow: 'md',
      render: (college) => {
        const total = college.course_count ?? 0
        const complete = college.complete_course_count ?? 0
        if (total === 0) return <span className="text-text-secondary">—</span>
        if (complete === total) return <Badge color="success">All {total} complete</Badge>
        // The two biggest gaps inline, the full list on hover — five checks inline wrapped to four lines.
        const checks = [...(college.missing_checks ?? [])].sort((a, b) => b.count - a.count)
        const missing = checks.map((m) => `${m.label} (${m.count})`).join(', ')
        const shown = checks
          .slice(0, 2)
          .map((m) => m.label)
          .join(', ')
        return (
          <span className="flex flex-col items-end" title={`Missing on some courses: ${missing}`}>
            <Badge color="warning">{`${complete}/${total} complete`}</Badge>
            <span className="whitespace-nowrap text-caption text-text-secondary">
              Missing {shown}
              {checks.length > 2 ? ` +${checks.length - 2} more` : ''}
            </span>
          </span>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (college) => (
        <StopPropagation className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditingCollege(college)}
            aria-label={`Edit ${college.name}`}
            title="Edit"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </StopPropagation>
      ),
    },
  ]

  const filtered = Boolean(search || countryFilter.length || statusFilter || healthFilter)

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <h1 className="text-h1 text-text-primary">Colleges & Courses</h1>
            <p className="text-body-sm text-text-secondary">Click a college to manage its campuses and courses.</p>
          </div>
          <div className="flex flex-col items-end gap-xs">
            <div className="flex gap-sm">
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
              <Button variant="secondary" loading={importColleges.isPending} onClick={handleImportClick}>
                Import CSV
              </Button>
              <Button onClick={() => setShowAddCollege(true)}>Add College</Button>
            </div>
            <p className="text-caption text-text-secondary">CSV columns: name, website, description</p>
          </div>
        </div>

        {/* Over the whole catalogue, so it does not shift as the list is filtered (2026-09-11). */}
        <div className="grid grid-cols-1 gap-md sm:grid-cols-3">
          <Card>
            <p className="text-caption text-text-secondary">Colleges</p>
            <p className="mt-xs text-h1 text-text-primary">{summary?.college_count ?? '…'}</p>
          </Card>
          <Card>
            <p className="text-caption text-text-secondary">Courses</p>
            <p className="mt-xs text-h1 text-text-primary">{summary?.course_count ?? '…'}</p>
          </Card>
          <Card>
            <p className="text-caption text-text-secondary">Courses with complete details</p>
            <p className="mt-xs text-h1 text-text-primary">{completePercent == null ? '—' : `${completePercent}%`}</p>
            {summary && summary.course_count > 0 && (
              <p className="text-caption text-text-secondary">
                {summary.complete_course_count} of {summary.course_count}
              </p>
            )}
          </Card>
        </div>

        {importColleges.isSuccess && importColleges.data && (
          <ImportResultPanel result={importColleges.data} onDismiss={() => importColleges.reset()} />
        )}
        {importColleges.isError && <p className="text-body-sm text-error">{importColleges.error.message}</p>}

        {showAddCollege && (
          <CollegeFormModal
            onClose={() => setShowAddCollege(false)}
            onCreated={(created) => navigate(`/admin/colleges/${created.id}`)}
          />
        )}
        {editingCollege && <CollegeFormModal college={editingCollege} onClose={() => setEditingCollege(null)} />}

        <Table
          columns={columns}
          rows={colleges.data?.items ?? []}
          rowKey={(college) => college.id!}
          loading={colleges.isLoading}
          error={colleges.isError ? 'Could not load colleges.' : undefined}
          emptyMessage={filtered ? 'No colleges match these filters.' : 'No colleges yet. Add the first one with Add College above.'}
          onRowClick={(college) => navigate(`/admin/colleges/${college.id}`)}
          sort={sort}
          onSortChange={(field, direction) => {
            setSort({ field, direction })
            resetPaging()
          }}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              resetPaging()
            },
            placeholder: 'Search college name…',
          }}
          filters={
            <>
              <FilterMultiSelect
                label="Country"
                options={countries.data ?? []}
                selected={countryFilter}
                onChange={(next) => {
                  setCountryFilter(next)
                  resetPaging()
                }}
                renderOption={(c) => <CountryLabel name={c} />}
              />
              <CompactSelect
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as '' | 'active' | 'inactive')
                  resetPaging()
                }}
                label="Status"
              >
                <option value="">Any status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </CompactSelect>
              <CompactSelect
                value={healthFilter}
                onChange={(e) => {
                  setHealthFilter(e.target.value as '' | 'needs_details' | 'complete')
                  resetPaging()
                }}
                label="Details"
              >
                <option value="">Any details</option>
                <option value="needs_details">Needs details</option>
                <option value="complete">All complete</option>
              </CompactSelect>
            </>
          }
          pagination={{
            hasNext: Boolean(colleges.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => colleges.data?.meta.next_cursor && paging.next(colleges.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: colleges.data?.meta.total,
          }}
        />
      </div>
    </AdminShell>
  )
}

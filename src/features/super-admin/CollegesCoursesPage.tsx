import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { FieldLabel } from '@/components/FieldLabel'
import { Table, type TableColumn } from '@/components/Table'
import { StopPropagation } from '@/components/StopPropagation'
import { Modal } from '@/components/Modal'
import { ImageUploadField } from '@/components/ImageUploadField'
import { useAdminColleges, useCreateCollege, useImportColleges, useUpdateCollege } from '@/queries/adminColleges'
import { useCountries } from '@/queries/countries'
import { useCursorPagination } from '@/lib/pagination'
import type { components } from '@/api/schema'

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
function CollegeFormModal({ editingCollege, onClose }: { editingCollege?: College; onClose: () => void }) {
  const isEditing = Boolean(editingCollege)
  const updateCollege = useUpdateCollege(editingCollege?.id ?? '')
  const [name, setName] = useState(editingCollege?.name ?? '')
  const [logoUrl, setLogoUrl] = useState(editingCollege?.logo_url ?? '')
  const [website, setWebsite] = useState(editingCollege?.website ?? '')
  const [description, setDescription] = useState(editingCollege?.description ?? '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name) return
    const body = { name, logo_url: logoUrl || null, website: website || null, description }
    updateCollege.mutate(body, { onSuccess: () => onClose() })
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit College' : 'Add College'}
      widthRem={28}
      footer={
        <>
          {updateCollege.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updateCollege.error.message}</p>
          )}
          <Button type="submit" form="college-form" loading={updateCollege.isPending} disabled={!name}>
            Save Changes
          </Button>
        </>
      }
    >
      <form id="college-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="College name" required value={name} onChange={(e) => setName(e.target.value)} />
        <ImageUploadField
          label="Logo"
          value={logoUrl ?? ''}
          onChange={setLogoUrl}
          hint="Square — shown as a 56×56 circle in the app. Ideal size 200×200px."
        />
        <TextField label="Website" value={website ?? ''} onChange={(e) => setWebsite(e.target.value)} />
        <div className="flex flex-col gap-xs">
          <FieldLabel htmlFor="college-description">Description</FieldLabel>
          <textarea
            id="college-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded-md border border-border bg-surface p-sm text-body text-text-primary"
          />
        </div>
      </form>
    </Modal>
  )
}

function AddCollegeModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [website, setWebsite] = useState('')
  const [description, setDescription] = useState('')
  const createCollege = useCreateCollege()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name) return
    createCollege.mutate(
      { name, logo_url: logoUrl || null, website: website || null, description, active: true },
      { onSuccess: (college: College) => navigate(`/admin/colleges/${college.id}`) },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Add College"
      widthRem={28}
      footer={
        <>
          {createCollege.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{createCollege.error.message}</p>
          )}
          <Button type="submit" form="add-college-form" loading={createCollege.isPending} disabled={!name}>
            Create
          </Button>
        </>
      }
    >
      <form id="add-college-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="College name" required value={name} onChange={(e) => setName(e.target.value)} />
        <ImageUploadField
          label="Logo"
          value={logoUrl}
          onChange={setLogoUrl}
          hint="Square — shown as a 56×56 circle in the app. Ideal size 200×200px."
        />
        <TextField label="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <div className="flex flex-col gap-xs">
          <FieldLabel htmlFor="new-college-description">Description</FieldLabel>
          <textarea
            id="new-college-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded-md border border-border bg-surface p-sm text-body text-text-primary"
          />
        </div>
      </form>
    </Modal>
  )
}

export function CollegesCoursesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('')
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const paging = useCursorPagination()
  const countries = useCountries()

  const colleges = useAdminColleges({
    search: search || undefined,
    country: country || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })
  const importColleges = useImportColleges()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showAddCollege, setShowAddCollege] = useState(false)
  const [editingCollege, setEditingCollege] = useState<College | null>(null)

  function resetPaging() {
    paging.reset()
  }

  function handleImportClick() {
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
      key: 'campus_count',
      header: 'Campuses',
      align: 'right',
      render: (college) => college.campus_count ?? 0,
    },
    {
      key: 'course_count',
      header: 'Courses',
      align: 'right',
      render: (college) => college.course_count ?? 0,
    },
    {
      // Catalog-health rollup (COURSES_MODULE_PLAN.md §5) — server-counted against the same
      // five capture checks the per-course meter runs, surfaced here so a data gap is a number
      // on the list, not a surprise found one course at a time.
      key: 'catalog_health',
      header: 'Catalog health',
      align: 'right',
      hideBelow: 'md',
      render: (college) => {
        const total = college.course_count ?? 0
        const complete = college.complete_course_count ?? 0
        if (total === 0) return <span className="text-text-secondary">—</span>
        return complete === total ? (
          <Badge color="success">All {total} complete</Badge>
        ) : (
          <Badge color="warning">{`${complete}/${total} complete`}</Badge>
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

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Colleges & Courses</h1>
            <p className="text-body-sm text-text-secondary">Click a college to manage its campuses and courses.</p>
          </div>
          <div className="flex gap-sm">
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            <Button variant="secondary" loading={importColleges.isPending} onClick={handleImportClick}>
              Import CSV
            </Button>
            <Button onClick={() => setShowAddCollege(true)}>Add College</Button>
          </div>
        </div>

        {importColleges.isSuccess && (
          <p className="text-body-sm text-success">Imported {importColleges.data?.created_count} college(s).</p>
        )}

        {showAddCollege && <AddCollegeModal onClose={() => setShowAddCollege(false)} />}
        {editingCollege && <CollegeFormModal editingCollege={editingCollege} onClose={() => setEditingCollege(null)} />}

        <Table
          columns={columns}
          rows={colleges.data?.items ?? []}
          rowKey={(college) => college.id!}
          loading={colleges.isLoading}
          error={colleges.isError ? 'Could not load colleges.' : undefined}
          emptyMessage="No colleges match these filters."
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
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value)
                resetPaging()
              }}
              className="h-9 rounded-md border border-border bg-background px-3 text-body-sm"
            >
              <option value="">All countries</option>
              {countries.data?.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
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

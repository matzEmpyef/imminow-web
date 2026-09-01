import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Copy, Pencil } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { StopPropagation } from '@/components/StopPropagation'
import { useDuplicateFormTemplate, useFormTemplates } from '@/queries/formTemplates'
import type { components } from '@/api/schema'

type FormTemplate = components['schemas']['FormTemplate']
type DuplicateFormTemplate = ReturnType<typeof useDuplicateFormTemplate>

// Row-level so the confirm popup's own `useState` has somewhere to live — TableColumn's
// `render: (row) => ...` runs as a callback, not a component body, so hooks can't go directly
// inside it (Rules of Hooks). `duplicateForm` is passed down rather than called again here since
// it's not per-id — one shared mutation instance, `mutate(id)` per row, same as elsewhere.
function FormRowActions({ form, duplicateForm }: { form: FormTemplate; duplicateForm: DuplicateFormTemplate }) {
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)

  return (
    <StopPropagation className="flex justify-end gap-xs">
      <Link
        to={`/administration/forms/${form.id}`}
        aria-label={`Edit ${form.name}`}
        title="Edit"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Pencil className="h-4 w-4" />
      </Link>
      <button
        type="button"
        onClick={() => setConfirmDuplicate(true)}
        aria-label={`Duplicate ${form.name}`}
        title="Duplicate"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Copy className="h-4 w-4" />
      </button>

      {confirmDuplicate && (
        <Modal
          onClose={() => setConfirmDuplicate(false)}
          title="Duplicate Form"
          widthRem={24}
          footer={
            <>
              {duplicateForm.isError && (
                <p className="mr-auto self-center text-body-sm text-error">{duplicateForm.error.message}</p>
              )}
              <div className="flex gap-sm">
                <Button
                  loading={duplicateForm.isPending}
                  onClick={() => duplicateForm.mutate(form.id, { onSuccess: () => setConfirmDuplicate(false) })}
                >
                  Duplicate
                </Button>
                <Button variant="secondary" onClick={() => setConfirmDuplicate(false)}>
                  Cancel
                </Button>
              </div>
            </>
          }
        >
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-secondary">
              This creates a new, independent copy of <strong className="text-text-primary">{form.name}</strong> —
              editing one won&apos;t affect the other.
            </p>
          </div>
        </Modal>
      )}
    </StopPropagation>
  )
}

// User-requested — was a manually-laid-out list of Cards; now the shared Table component, same
// platform-wide-consistency move every other list page already got.
export function FormsPage() {
  const navigate = useNavigate()
  const forms = useFormTemplates()
  const duplicateForm = useDuplicateFormTemplate()
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    let items = forms.data ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((f) => f.name.toLowerCase().includes(q))
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av = sort.field === 'version' ? a.version : a.name.toLowerCase()
        const bv = sort.field === 'version' ? b.version : b.name.toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [forms.data, search, sort])

  const columns: TableColumn<FormTemplate>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (form) => <span className="font-medium text-text-primary">{form.name}</span>,
    },
    { key: 'version', header: 'Version', sortable: true, align: 'right', render: (form) => `v${form.version}` },
    {
      key: 'fields',
      header: 'Fields',
      align: 'right',
      render: (form) => form.fields.length,
    },
    {
      key: 'actions',
      header: '',
      render: (form) => <FormRowActions form={form} duplicateForm={duplicateForm} />,
    },
  ]

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-h1 text-text-primary">Forms</h1>
          <Link to="/administration/forms/new">
            <Button>Create New</Button>
          </Link>
        </div>

        <Table
          columns={columns}
          rows={rows}
          rowKey={(form) => form.id}
          loading={forms.isLoading}
          error={forms.isError ? 'Could not load forms.' : undefined}
          emptyMessage="No form templates yet."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search forms…' }}
          onRowClick={(form) => navigate(`/administration/forms/${form.id}`)}
        />
      </div>
    </AppShell>
  )
}

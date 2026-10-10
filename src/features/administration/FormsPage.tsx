import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Copy, Eye, Pencil, RotateCcw } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { StopPropagation } from '@/components/StopPropagation'
import { useDuplicateFormTemplate, useFormTemplates } from '@/queries/formTemplates'
import { usePermissionChecker } from '@/lib/permissions'
import { showToast } from '@/lib/toast'
import { EDIT_DEFAULT_CONFIRMED } from '@/lib/defaultForm'
import { countFillableFields } from '@/lib/formFields'
import { EditDefaultFormDialog, RestoreDefaultFormDialog } from './DefaultFormDialogs'
import type { components } from '@/api/schema'

type FormTemplate = components['schemas']['FormTemplate']
type DuplicateFormTemplate = ReturnType<typeof useDuplicateFormTemplate>

// Row-level so the confirm popup's own `useState` has somewhere to live — TableColumn's
// `render: (row) => ...` runs as a callback, not a component body, so hooks can't go directly
// inside it (Rules of Hooks). `duplicateForm` is passed down rather than called again here since
// it's not per-id — one shared mutation instance, `mutate(id)` per row, same as elsewhere.
function FormRowActions({
  form,
  duplicateForm,
  onEdit,
}: {
  form: FormTemplate
  duplicateForm: DuplicateFormTemplate
  onEdit: (form: FormTemplate) => void
}) {
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)

  return (
    <StopPropagation className="flex justify-end gap-xs">
      {form.is_default && (
        <button
          type="button"
          onClick={() => setConfirmRestore(true)}
          aria-label={`Restore default ${form.name}`}
          title="Restore default"
          className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      )}
      {/* Still a real link (open in a new tab works); a plain click on the default form asks
          first. */}
      <Link
        to={`/administration/forms/${form.id}`}
        onClick={(e) => {
          if (!form.is_default || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
          e.preventDefault()
          onEdit(form)
        }}
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
                  onClick={() =>
                    duplicateForm.mutate(form.id, {
                      onSuccess: () => {
                        showToast(`${form.name} form duplicated`)
                        setConfirmDuplicate(false)
                      },
                    })
                  }
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
      {confirmRestore && (
        <RestoreDefaultFormDialog currentDefaultId={form.id} onClose={() => setConfirmRestore(false)} />
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
  // Reading the list is open to every employee. Creating, editing and duplicating a form need
  // `settings.manage_templates` on the server (review F-146 / F-055), so those controls are shown
  // only to someone who holds it.
  const { can } = usePermissionChecker()
  const canManage = can('settings.manage_templates')
  // The server says, per form, whether the reader may change it (`can_edit`, owner's ruling
  // 2026-10-10). That answer wins; the permission is only the fallback for a form that carries none.
  const canEditForm = (form: FormTemplate) => form.can_edit ?? canManage
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  // The default form (owner decisions 30/31) asks before it is edited: a copy is the better way.
  const [editingDefault, setEditingDefault] = useState<FormTemplate | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  // Every consultancy has one default form. Where none is listed, Restore default is offered for
  // the page so it can be made again (the server recreates it).
  const hasNoDefault = forms.data !== undefined && !forms.data.some((f) => f.is_default)

  function openForEdit(form: FormTemplate) {
    if (form.is_default) setEditingDefault(form)
    else navigate(`/administration/forms/${form.id}`)
  }

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
      render: (form) => (
        <span className="inline-flex items-center gap-sm">
          <span className="font-medium text-text-primary">{form.name}</span>
          {form.is_default && <Badge color="info">Default</Badge>}
        </span>
      ),
    },
    { key: 'version', header: 'Version', sortable: true, align: 'right', render: (form) => `v${form.version}` },
    {
      key: 'fields',
      header: 'Fields',
      align: 'right',
      render: (form) => countFillableFields(form.fields),
    },
    {
      key: 'actions',
      header: '',
      render: (form: FormTemplate) =>
        canEditForm(form) ? (
          <FormRowActions form={form} duplicateForm={duplicateForm} onEdit={openForEdit} />
        ) : (
          // A form the reader may not change still opens, read-only (review 2.64).
          <StopPropagation className="flex justify-end">
            <Link
              to={`/administration/forms/${form.id}`}
              aria-label={`View ${form.name}`}
              title="View"
              className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
            >
              <Eye className="h-4 w-4" />
            </Link>
          </StopPropagation>
        ),
    },
  ]

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-h1 text-text-primary">Forms</h1>
          {canManage && (
            <div className="flex items-center gap-sm">
              {hasNoDefault && (
                <Button variant="secondary" onClick={() => setConfirmRestore(true)}>
                  Restore default
                </Button>
              )}
              <Link to="/administration/forms/new">
                <Button>Create New</Button>
              </Link>
            </div>
          )}
        </div>

        <Table
          columns={columns}
          rows={rows}
          rowKey={(form) => form.id}
          loading={forms.isLoading}
          error={forms.isError ? 'Could not load forms.' : undefined} errorSource={forms.error}
          emptyMessage={
            search
              ? 'No forms match your search.'
              : canManage
                ? 'No form templates yet. Create one and attach it to a plan step for clients to fill in.'
                : 'No form templates yet.'
          }
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search forms…' }}
          onRowClick={(form) => (canEditForm(form) ? openForEdit(form) : navigate(`/administration/forms/${form.id}`))}
        />

        {editingDefault && (
          <EditDefaultFormDialog
            form={editingDefault}
            onClose={() => setEditingDefault(null)}
            onEditAnyway={() =>
              navigate(`/administration/forms/${editingDefault.id}`, { state: EDIT_DEFAULT_CONFIRMED })
            }
          />
        )}
        {confirmRestore && (
          <RestoreDefaultFormDialog currentDefaultId={undefined} onClose={() => setConfirmRestore(false)} />
        )}
      </div>
    </AppShell>
  )
}

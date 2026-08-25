import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { AddFieldModal } from './AddFieldModal'
import { AddGroupModal } from './AddGroupModal'
import { FormFieldsPreview } from './FormFieldsPreview'
import { useCreateFormTemplate, useFormTemplate, useUpdateFormTemplate } from '@/queries/formTemplates'
import { isGroup, listGroups, type FormFieldInput } from '@/lib/formFields'
import { Skeleton } from '@/components/QueryState'

export function FormBuilderPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const existing = useFormTemplate(isNew ? undefined : id)
  const createForm = useCreateFormTemplate()
  const updateForm = useUpdateFormTemplate(id ?? '')

  const [name, setName] = useState('')
  const [fields, setFields] = useState<FormFieldInput[]>([])
  const [showAddField, setShowAddField] = useState(false)
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [editingField, setEditingField] = useState<{ field: FormFieldInput; groupId: string | null } | null>(null)
  const [editingGroup, setEditingGroup] = useState<{ id: string; label: string } | null>(null)

  useEffect(() => {
    if (!existing.data) return
    setName(existing.data.name)
    setFields(existing.data.fields)
  }, [existing.data])

  function addField(field: FormFieldInput, targetGroupId: string | null) {
    setFields((prev) => {
      if (!targetGroupId) return [...prev, field]
      return prev.map((f) => (f.id === targetGroupId ? { ...f, fields: [...(f.fields ?? []), field] } : f))
    })
  }

  function addGroup(group: FormFieldInput) {
    setFields((prev) => [...prev, group])
  }

  // groupId=null removes a top-level item — a plain field or a whole group (with its children,
  // since a group only ever lives at the top level and this just filters it out of the array).
  function removeField(groupId: string | null, fieldId: string) {
    setFields((prev) => {
      if (!groupId) return prev.filter((f) => f.id !== fieldId)
      return prev.map((f) =>
        f.id === groupId ? { ...f, fields: (f.fields ?? []).filter((c) => c.id !== fieldId) } : f,
      )
    })
  }

  // Same groupId convention as removeField — replaces the field/group in place, keeping its
  // existing id and (for a group) its existing children, rather than moving it.
  function updateField(groupId: string | null, fieldId: string, updated: FormFieldInput) {
    setFields((prev) => {
      if (!groupId) return prev.map((f) => (f.id === fieldId ? { ...updated, id: fieldId } : f))
      return prev.map((f) =>
        f.id === groupId
          ? { ...f, fields: (f.fields ?? []).map((c) => (c.id === fieldId ? { ...updated, id: fieldId } : c)) }
          : f,
      )
    })
  }

  function updateGroupLabel(groupId: string, label: string) {
    setFields((prev) => prev.map((f) => (f.id === groupId ? { ...f, label } : f)))
  }

  // User-requested — "shouldn't we want the ability to edit also." Groups only have a name, so
  // they route to the rename-only AddGroupModal; everything else opens the full AddFieldModal.
  function startEdit(groupId: string | null, field: FormFieldInput) {
    if (isGroup(field)) {
      setEditingGroup({ id: field.id!, label: field.label })
    } else {
      setEditingField({ field, groupId })
    }
  }

  function handleSave() {
    if (!name || fields.length === 0) return
    if (isNew) {
      createForm.mutate({ name, fields }, { onSuccess: () => navigate('/administration/forms') })
    } else {
      updateForm.mutate({ name, fields }, { onSuccess: () => navigate('/administration/forms') })
    }
  }

  const saving = createForm.isPending || updateForm.isPending
  const error = createForm.error ?? updateForm.error
  const groups = listGroups(fields)

  if (!isNew && existing.isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 rounded-lg" />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <h1 className="text-h1 text-text-primary">{isNew ? 'New Form' : 'Edit Form'}</h1>

        <Card>
          <TextField label="Form name" value={name} onChange={(e) => setName(e.target.value)} />
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-body-sm font-medium text-text-primary">Fields</p>
            <div className="flex gap-sm">
              <Button variant="secondary" onClick={() => setShowAddGroup(true)}>
                Add Group
              </Button>
              <Button variant="secondary" onClick={() => setShowAddField(true)}>
                Add Field
              </Button>
            </div>
          </div>
          <div className="mt-sm">
            <FormFieldsPreview fields={fields} onChange={setFields} onRemove={removeField} onEdit={startEdit} />
          </div>
        </Card>

        {(showAddField || editingField) && (
          <AddFieldModal
            groups={groups}
            editingField={editingField?.field}
            onAdd={(field, targetGroupId) =>
              editingField
                ? updateField(editingField.groupId, editingField.field.id!, field)
                : addField(field, targetGroupId)
            }
            onClose={() => {
              setShowAddField(false)
              setEditingField(null)
            }}
          />
        )}
        {(showAddGroup || editingGroup) && (
          <AddGroupModal
            editingGroup={editingGroup ?? undefined}
            onAdd={addGroup}
            onSave={(label) => updateGroupLabel(editingGroup!.id, label)}
            onClose={() => {
              setShowAddGroup(false)
              setEditingGroup(null)
            }}
          />
        )}

        {error && <p className="text-body-sm text-error">{error.message}</p>}

        <div className="flex gap-sm">
          <Button onClick={handleSave} loading={saving} disabled={!name || fields.length === 0}>
            {isNew ? 'Create Form' : 'Save Changes'}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/administration/forms')}>
            Cancel
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

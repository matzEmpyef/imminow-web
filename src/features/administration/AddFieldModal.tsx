import { useState } from 'react'
import { SelectField } from '@/components/SelectField'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import {
  FIELD_TYPES,
  NON_TABLE_TYPES,
  WIDTH_LABELS,
  isSelectType,
  newFieldId,
  type FieldType,
  type FormFieldInput,
  type Width,
} from '@/lib/formFields'

const WIDTHS: Width[] = ['full', 'half', 'third']

// User-requested — was an inline Card at the bottom of the page; now a popup opened via an
// "Add Field" button, same "inline form → popup" move every other page got this session. Also
// gained Width (user-requested, ties into the live preview's side-by-side layout) and a target
// group picker (user-requested grouping — a field can land inside an existing group instead of
// always at the top level).
//
// Doubles as the Edit Field popup when `editingField` is supplied (user-requested — "shouldn't
// we want the ability to edit also"): same form, pre-filled, minus the "Add to" group picker
// (moving a field between containers is what drag-and-drop is for, not this popup) — the caller
// keeps the field's original id/location and just replaces its contents via the same `onAdd`
// callback, so this component doesn't need a separate edit-vs-create code path of its own.
export function AddFieldModal({
  groups,
  editingField,
  onAdd,
  onClose,
}: {
  groups: { id: string; label: string }[]
  editingField?: FormFieldInput
  onAdd: (field: FormFieldInput, targetGroupId: string | null) => void
  onClose: () => void
}) {
  const isEditing = Boolean(editingField)
  const [type, setType] = useState<FieldType>(editingField?.type ?? 'text')
  const [label, setLabel] = useState(editingField?.label ?? '')
  const [required, setRequired] = useState(editingField?.required ?? false)
  const [width, setWidth] = useState<Width>((editingField?.width as Width | null | undefined) ?? 'full')
  const [targetGroupId, setTargetGroupId] = useState('')
  const [options, setOptions] = useState(editingField?.options?.join(', ') ?? '')
  const [columns, setColumns] = useState<FormFieldInput[]>(editingField?.table_columns ?? [])
  const [columnType, setColumnType] = useState<Exclude<FieldType, 'table' | 'group'>>('text')
  const [columnLabel, setColumnLabel] = useState('')

  function addColumn() {
    if (!columnLabel) return
    setColumns((prev) => [...prev, { type: columnType, label: columnLabel, required: false }])
    setColumnLabel('')
  }

  function handleAdd() {
    if (!label) return
    onAdd(
      {
        id: editingField?.id ?? newFieldId(),
        type,
        label,
        required,
        width,
        options: isSelectType(type)
          ? options
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean)
          : undefined,
        table_columns: type === 'table' ? columns : undefined,
      },
      targetGroupId || null,
    )
    onClose()
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Field' : 'Add Field'}
      widthRem={30}
      footer={
        <Button type="button" onClick={handleAdd} disabled={!label}>
          {isEditing ? 'Save Changes' : 'Add Field'}
        </Button>
      }
    >
      <div className="flex flex-col gap-md">
        <div className="grid grid-cols-2 gap-md">
          <SelectField label="Type" id="field-type" value={type} onChange={(e) => setType(e.target.value as FieldType)}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </SelectField>
          {/* Type's column has a label line above its select; TextField's label floats inside
              the input instead, so without this the two controls sit at different heights. */}
          <div className="mt-lg">
            <TextField label="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-md">
          <SelectField label="Width" id="field-width" value={width} onChange={(e) => setWidth(e.target.value as Width)}>
            {WIDTHS.map((w) => (
              <option key={w} value={w}>
                {WIDTH_LABELS[w]}
              </option>
            ))}
          </SelectField>
          {!isEditing && groups.length > 0 && (
            <SelectField
              label="Add to"
              id="field-group"
              value={targetGroupId}
              onChange={(e) => setTargetGroupId(e.target.value)}
            >
              <option value="">Top level</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </SelectField>
          )}
        </div>

        <label className="flex items-center gap-xs text-body-sm text-text-primary">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="h-4 w-4"
          />
          Required
        </label>

        {isSelectType(type) && (
          <TextField label="Options (comma-separated)" value={options} onChange={(e) => setOptions(e.target.value)} />
        )}

        {type === 'table' && (
          <div className="rounded-md border border-border p-md">
            <p className="text-body-sm font-medium text-text-primary">Table Columns</p>
            <div className="mt-sm flex flex-col gap-xs">
              {columns.map((col, i) => (
                <p key={i} className="text-body-sm text-text-secondary capitalize">
                  {col.label} ({col.type.replace('_', ' ')})
                </p>
              ))}
            </div>
            <div className="mt-sm flex items-end gap-sm">
              <SelectField
                label="Column type"
                id="column-type"
                value={columnType}
                onChange={(e) => setColumnType(e.target.value as Exclude<FieldType, 'table' | 'group'>)}
              >
                {NON_TABLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace('_', ' ')}
                  </option>
                ))}
              </SelectField>
              <TextField label="Column label" value={columnLabel} onChange={(e) => setColumnLabel(e.target.value)} />
              <Button type="button" variant="secondary" onClick={addColumn} disabled={!columnLabel}>
                Add Column
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

import { useState, type ReactNode } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import type { components } from '@/api/schema'
import { formatDate } from '@/lib/time'

type FormField = components['schemas']['FormField']
// One saved row: the column's id to that cell's answer. This is the shape the Sentpo app writes
// (applicant_form_screen.dart, `_TableInput`): the table's answer is a list of these, a cell holds
// what the same field type holds at the top level, and a column nobody touched has no key.
type FormTableRow = Record<string, unknown>

// The server stores `answers` as sent and checks nothing inside it, so anything may come back.
// Whatever is not a list reads as no rows; a row that is not an object reads as an empty row and
// keeps its place, so row numbers here match the saved list.
function tableRows(value: unknown): FormTableRow[] {
  if (!Array.isArray(value)) return []
  return value.map((row) => (row && typeof row === 'object' && !Array.isArray(row) ? (row as FormTableRow) : {}))
}

function isCellFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && value !== ''
}

// One cell, read by its column's type. Yes/No is saved as the words themselves; a date as
// YYYY-MM-DD, shown in the console's own date format.
function formatTableCell(column: FormField, value: unknown): string {
  if (!isCellFilled(value)) return '—'
  switch (column.type) {
    case 'multi_select':
      return Array.isArray(value) ? value.map(String).join(', ') : String(value)
    case 'yes_no':
      if (typeof value === 'boolean') return value ? 'Yes' : 'No'
      return String(value)
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? formatDate(value.slice(0, 10)) : String(value)
    default:
      return Array.isArray(value) ? value.map(String).join(', ') : String(value)
  }
}

/** The id of a table field's box on the page, so a refused save can scroll to it. */
export function tableFieldDomId(fieldId: string): string {
  return `form-field-${fieldId}`
}

interface IndexedRow {
  index: number
  row: FormTableRow
}

// A table field on the client's Forms tab: the applicant's rows as a real table, and, where the
// tab can be edited, Add row / edit / remove. A change lands in the form's unsaved answers like
// any other field's; the tab's own Save sends it.
export function FormTableField({
  field,
  value,
  onChange,
  readOnly = false,
  error,
  renderInput,
}: {
  field: FormField
  value: unknown
  onChange: (rows: FormTableRow[]) => void
  readOnly?: boolean
  // The server's sentence when it refused the save over this table ("Add at least one row to ...").
  error?: string
  // The tab's own input for one field, so a cell is filled with the same control as that field
  // type anywhere else on the form.
  renderInput: (column: FormField, row: FormTableRow, onCellChange: (columnId: string, value: unknown) => void) => ReactNode
}) {
  const columns = field.table_columns ?? []
  const rows = tableRows(value)
  // `index: null` is a new row; a number is the saved row being edited.
  const [editing, setEditing] = useState<{ index: number | null; row: FormTableRow } | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)

  const tableColumns: TableColumn<IndexedRow>[] = columns.map((column) => ({
    key: column.id,
    header: (
      <span className="whitespace-nowrap">
        {column.label}
        {column.required && <span className="text-required"> *</span>}
      </span>
    ),
    render: ({ row }) => (
      // A floor on the width, so a table with many columns scrolls sideways inside its own box
      // instead of squeezing every cell to a word per line.
      <div
        style={{ minWidth: column.type === 'long_text' ? '14rem' : '7rem' }}
        className={column.type === 'long_text' ? 'whitespace-pre-wrap' : undefined}
      >
        {formatTableCell(column, row[column.id])}
      </div>
    ),
  }))
  if (!readOnly) {
    tableColumns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: ({ index, row }) => (
        <div className="flex justify-end gap-xs">
          <button
            type="button"
            onClick={() => setEditing({ index, row })}
            aria-label={`Edit row ${index + 1}`}
            title="Edit row"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setRemoving(index)}
            aria-label={`Remove row ${index + 1}`}
            title="Remove row"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    })
  }

  function applyEditing() {
    if (!editing) return
    // The original list goes back with one row changed, so anything else saved in it is kept.
    const next = Array.isArray(value) ? [...(value as FormTableRow[])] : []
    if (editing.index === null) next.push(editing.row)
    else next[editing.index] = editing.row
    onChange(next)
    setEditing(null)
  }

  const editingHasAnswer = editing !== null && columns.some((column) => isCellFilled(editing.row[column.id]))

  return (
    // Same box and title as a `group` section, so a form whose sections are part groups and part
    // tables (the default Student Application Form) reads as one document. `min-w-0` keeps a wide
    // table's sideways scroll inside this box.
    <div
      id={tableFieldDomId(field.id)}
      tabIndex={-1}
      className={`flex min-w-0 flex-col gap-md rounded-md border p-md outline-none ${error ? 'border-error' : 'border-border'}`}
    >
      <div className="flex items-center justify-between gap-md">
        <p className="text-body-sm font-medium text-text-primary">
          {field.label}
          {field.required && <span className="text-required"> *</span>}
        </p>
        {!readOnly && columns.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setEditing({ index: null, row: {} })}>
            Add row
          </Button>
        )}
      </div>
      <Table
        bare
        columns={tableColumns}
        rows={rows.map((row, index) => ({ index, row }))}
        rowKey={({ index }) => String(index)}
        emptyMessage="No rows yet."
      />
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}

      {editing && (
        <Modal
          onClose={() => setEditing(null)}
          title={editing.index === null ? `Add row: ${field.label}` : `Edit row ${editing.index + 1}: ${field.label}`}
          widthRem={32}
          footer={
            <div className="flex justify-end gap-sm">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button disabled={!editingHasAnswer} onClick={applyEditing}>
                {editing.index === null ? 'Add row' : 'Update row'}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-md">
            {columns.map((column) => (
              <div key={column.id}>
                {renderInput(column, editing.row, (columnId, cell) =>
                  setEditing((current) => (current ? { ...current, row: { ...current.row, [columnId]: cell } } : current)),
                )}
              </div>
            ))}
            <p className="text-caption text-text-secondary">Save the form to keep this row.</p>
          </div>
        </Modal>
      )}

      {removing !== null && (
        <Modal
          onClose={() => setRemoving(null)}
          title="Remove row"
          widthRem={26}
          footer={
            <div className="flex justify-end gap-sm">
              <Button variant="secondary" onClick={() => setRemoving(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onChange((value as FormTableRow[]).filter((_, i) => i !== removing))
                  setRemoving(null)
                }}
              >
                Remove
              </Button>
            </div>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Remove <span className="font-medium text-text-primary">row {removing + 1}</span> from {field.label}? Save the
            form to keep this change.
          </p>
        </Modal>
      )}
    </div>
  )
}

import { SettingsUsedIn } from './SettingsUsedIn'
import { useMemo, useState, type FormEvent } from 'react'
import { Archive, ArchiveRestore, GitMerge, Pencil } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { SearchSelect } from '@/components/SearchSelect'
import { Table, type TableColumn } from '@/components/Table'
import { TextField } from '@/components/TextField'
import {
  useCreateFieldOfStudy,
  useFieldsOfStudy,
  useMergeFieldOfStudy,
  useUpdateFieldOfStudy,
} from '@/queries/fieldsOfStudy'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'

type FieldOfStudy = components['schemas']['FieldOfStudy']

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function splitAliases(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function FieldFormModal({ field, onClose }: { field?: FieldOfStudy; onClose: () => void }) {
  const isEditing = Boolean(field)
  const create = useCreateFieldOfStudy()
  const update = useUpdateFieldOfStudy()
  const mutation = isEditing ? update : create
  const [name, setName] = useState(field?.name ?? '')
  const [aliasText, setAliasText] = useState((field?.aliases ?? []).join(', '))
  const aliases = splitAliases(aliasText)
  const renaming = isEditing && name.trim() !== field!.name
  const usedBy = field ? (field.course_count ?? 0) + (field.student_count ?? 0) : 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (field) {
      update.mutate(
        { id: field.id, name: name.trim(), aliases },
        {
          onSuccess: () => {
            showToast(`${name.trim()} updated`)
            onClose()
          },
        },
      )
    } else {
      create.mutate(
        { name: name.trim(), aliases },
        {
          onSuccess: () => {
            showToast(`${name.trim()} added`)
            onClose()
          },
        },
      )
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Field of Study' : 'Add Field of Study'}
      widthRem={30}
      footer={
        <>
          {mutation.isError && <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="field-of-study-form" loading={mutation.isPending} disabled={!name.trim()}>
            {isEditing ? 'Save Changes' : 'Add Field'}
          </Button>
        </>
      }
    >
      <form id="field-of-study-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="Alternate names"
          value={aliasText}
          onChange={(e) => setAliasText(e.target.value)}
          placeholder="e.g. CS, Computing"
        />
        <p className="text-caption text-text-secondary">
          Separate with commas. A student searching any of these finds courses in this field. Each alternate name can
          belong to one field only.
        </p>
        {aliases.length > 0 && (
          <div className="flex flex-wrap gap-xs">
            {aliases.map((a) => (
              <Badge key={a} color="secondary">
                {a}
              </Badge>
            ))}
          </div>
        )}
        {renaming && usedBy > 0 && (
          <p className="rounded-md bg-warning/10 p-sm text-caption text-text-secondary">
            The new name is applied to {plural(field!.course_count ?? 0, 'course')} and{' '}
            {plural(field!.student_count ?? 0, 'student')} who chose this field.
          </p>
        )}
      </form>
    </Modal>
  )
}

function MergeFieldModal({ field, fields, onClose }: { field: FieldOfStudy; fields: FieldOfStudy[]; onClose: () => void }) {
  const merge = useMergeFieldOfStudy()
  const [intoId, setIntoId] = useState('')
  const target = fields.find((f) => f.id === intoId)
  const options = fields
    .filter((f) => f.id !== field.id && f.active !== false)
    .map((f) => ({ id: f.id, label: f.name, sublabel: f.aliases?.length ? `Also: ${f.aliases.join(', ')}` : undefined }))

  return (
    <Modal
      onClose={onClose}
      title={`Merge ${field.name}`}
      widthRem={30}
      footer={
        <>
          {merge.isError && <p className="mr-auto self-center text-body-sm text-error">{merge.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={merge.isPending}
            disabled={!intoId}
            onClick={() =>
              merge.mutate(
                { id: field.id, intoId },
                {
                  onSuccess: () => {
                    showToast(`${field.name} merged into ${target?.name ?? 'the selected field'}`)
                    onClose()
                  },
                },
              )
            }
          >
            Merge
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          For a duplicate — say &ldquo;Computing&rdquo; beside &ldquo;Computer Science&rdquo;. Choose the field to keep.
        </p>
        <SearchSelect
          id={`merge-into-${field.id}`}
          label="Merge into"
          required
          options={options}
          value={intoId}
          onChange={setIntoId}
          placeholder="Search fields…"
        />
        {target && (
          <ul className="flex list-disc flex-col gap-xs pl-lg text-body-sm text-text-secondary">
            <li>
              {plural(field.course_count ?? 0, 'course')} and {plural(field.student_count ?? 0, 'student')} move to{' '}
              <span className="font-medium text-text-primary">{target.name}</span>.
            </li>
            <li>
              &ldquo;{field.name}&rdquo;{field.aliases?.length ? ` and its alternate names` : ''} become alternate names of{' '}
              {target.name}, so searches for them keep working.
            </li>
            <li>{field.name} is removed from the list. This can&rsquo;t be undone.</li>
          </ul>
        )}
      </div>
    </Modal>
  )
}

function FieldRowActions({
  field,
  onEdit,
  onMerge,
}: {
  field: FieldOfStudy
  onEdit: () => void
  onMerge: () => void
}) {
  const update = useUpdateFieldOfStudy()
  const [confirming, setConfirming] = useState(false)
  const retired = field.active === false
  const used = (field.course_count ?? 0) + (field.student_count ?? 0) > 0

  return (
    <div className="flex items-center justify-end gap-xs">
      {retired && <Badge color="secondary">Retired</Badge>}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${field.name}`}
        title="Edit"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onMerge}
        aria-label={`Merge ${field.name} into another field`}
        title="Merge into another field"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <GitMerge className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => (retired ? update.mutate({ id: field.id, active: true }) : setConfirming(true))}
        disabled={update.isPending}
        aria-label={retired ? `Restore ${field.name}` : `Retire ${field.name}`}
        title={retired ? 'Restore' : used ? 'In use — merge it instead' : 'Retire'}
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary disabled:opacity-40"
      >
        {retired ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
      </button>
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Retire field of study"
          widthRem={26}
          footer={
            <>
              {update.isError && <p className="mr-auto self-center text-body-sm text-error">{update.error.message}</p>}
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={update.isPending}
                onClick={() => update.mutate({ id: field.id, active: false }, { onSuccess: () => setConfirming(false) })}
              >
                Retire
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Stop offering <span className="font-medium text-text-primary">{field.name}</span> in the course form. A field
            still used by courses or students can&rsquo;t be retired — merge it into another field instead.
          </p>
        </Modal>
      )}
    </div>
  )
}

/**
 * Fields of Study (2026-09-11) — the managed list behind a course's field and a student's fields of
 * interest, with the alternate names search also answers to. Rename and merge rewrite every course
 * and preference holding the field, so tidying the list never strands anything.
 */
export function FieldsOfStudyTab() {
  const fields = useFieldsOfStudy(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<FieldOfStudy | null>(null)
  const [merging, setMerging] = useState<FieldOfStudy | null>(null)
  const all = useMemo(() => fields.data ?? [], [fields.data])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((f) => f.name.toLowerCase().includes(q) || (f.aliases ?? []).some((a) => a.toLowerCase().includes(q)))
  }, [all, search])

  const columns: TableColumn<FieldOfStudy>[] = [
    {
      key: 'name',
      header: 'Field',
      render: (f) => (
        <span className={f.active === false ? 'text-text-secondary line-through' : 'font-medium text-text-primary'}>
          {f.name}
        </span>
      ),
    },
    {
      key: 'aliases',
      header: 'Also found by',
      render: (f) =>
        f.aliases?.length ? (
          <div className="flex flex-wrap gap-xs">
            {f.aliases.map((a) => (
              <Badge key={a} color="secondary">
                {a}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-caption text-text-secondary">—</span>
        ),
    },
    {
      key: 'courses',
      header: 'Courses',
      align: 'right',
      hideBelow: 'sm',
      render: (f) => <span className="tabular-nums text-text-secondary">{f.course_count ?? 0}</span>,
    },
    {
      key: 'students',
      header: 'Students',
      align: 'right',
      hideBelow: 'md',
      render: (f) => <span className="tabular-nums text-text-secondary">{f.student_count ?? 0}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (f) => <FieldRowActions field={f} onEdit={() => setEditing(f)} onMerge={() => setMerging(f)} />,
    },
  ]

  return (
    <div className="flex flex-col gap-md">
      <div className="flex items-start justify-between gap-md">
        <div className="flex max-w-2xl flex-col gap-xs">
          <p className="text-body-sm text-text-secondary">
            One list behind a course&rsquo;s field and a student&rsquo;s fields of interest. Alternate names let
            students find a field however they type it — &ldquo;CS&rdquo; or &ldquo;Computing&rdquo; finds Computer
            Science in the Sentpo app and the Course Finder. Merge duplicates rather than keeping two names for one
            field.
          </p>
          <SettingsUsedIn places={['Course field', 'Sentpo fields of interest', 'Sentpo search', 'Course Finder']} />
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          Add Field
        </Button>
      </div>
      <Table
        columns={columns}
        rows={rows}
        rowKey={(f) => f.id}
        loading={fields.isLoading}
        error={fields.isError ? 'Could not load the fields of study list.' : undefined}
        emptyMessage={search ? 'No field or alternate name matches.' : 'No fields of study yet.'}
        search={{ value: search, onChange: setSearch, placeholder: 'Search fields and alternate names…' }}
      />
      {adding && <FieldFormModal onClose={() => setAdding(false)} />}
      {editing && <FieldFormModal field={editing} onClose={() => setEditing(null)} />}
      {merging && <MergeFieldModal field={merging} fields={all} onClose={() => setMerging(null)} />}
    </div>
  )
}

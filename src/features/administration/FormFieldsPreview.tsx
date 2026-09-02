import { useState, type ReactNode } from 'react'
import { DndContext, closestCenter, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, ChevronDown, GripVertical, Monitor, Pencil, Smartphone, X } from 'lucide-react'
import { WIDTH_CLASSES, isGroup, type FormFieldInput, type Width } from '@/lib/formFields'

const ROOT_ID = 'root'
function groupContainerId(groupId: string) {
  return `group:${groupId}`
}

function containerIdOf(fields: FormFieldInput[], fieldId: string): string {
  if (fields.some((f) => f.id === fieldId)) return ROOT_ID
  for (const f of fields) {
    if (isGroup(f) && f.fields?.some((c) => c.id === fieldId)) return groupContainerId(f.id!)
  }
  return ROOT_ID
}

function containerItems(fields: FormFieldInput[], containerId: string): FormFieldInput[] {
  if (containerId === ROOT_ID) return fields
  const groupId = containerId.slice('group:'.length)
  return fields.find((f) => f.id === groupId)?.fields ?? []
}

interface FormFieldsPreviewProps {
  fields: FormFieldInput[]
  onChange: (next: FormFieldInput[]) => void
  // groupId=null removes a top-level item — a plain field OR a whole group (with its children),
  // since a group can only ever live at the top level; groupId set removes one of that group's
  // own children.
  onRemove: (groupId: string | null, fieldId: string) => void
  // Same groupId convention as onRemove. Passes the field/group itself, not just its id, so the
  // caller doesn't have to re-look it up in the tree to prefill an edit popup.
  onEdit: (groupId: string | null, field: FormFieldInput) => void
}

// User-requested — "structure the form as it would actually look, so that user can move the
// fields around and place it as user wants." Replaces the old ▲/▼ list with a live drag-and-drop
// preview: each field renders as a rough mock of its real input control, side by side per its
// width, draggable to reorder or move into/out of a group. The Desktop/Mobile toggle demonstrates
// the "half/third always collapses to full width below md" rule live, without needing to resize
// the actual browser window — real responsive CSS classes (see formFields.ts), not a stored
// per-device flag.
export function FormFieldsPreview({ fields, onChange, onRemove, onEdit }: FormFieldsPreviewProps) {
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop')

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const activeContainer = containerIdOf(fields, activeId)
    const overContainer = overId === ROOT_ID || overId.startsWith('group:') ? overId : containerIdOf(fields, overId)

    const activeField = containerItems(fields, activeContainer).find((f) => f.id === activeId)
    if (!activeField) return
    // Groups only reorder among top-level siblings — dragging one onto a group's own drop zone
    // is a no-op, not a nested group.
    if (isGroup(activeField) && overContainer !== ROOT_ID) return

    const next = fields.map((f) => (isGroup(f) ? { ...f, fields: f.fields ? [...f.fields] : [] } : f))
    function arrayFor(containerId: string): FormFieldInput[] {
      if (containerId === ROOT_ID) return next
      const groupId = containerId.slice('group:'.length)
      return next.find((f) => f.id === groupId)?.fields ?? []
    }

    const fromArr = arrayFor(activeContainer)
    const fromIndex = fromArr.findIndex((f) => f.id === activeId)
    if (fromIndex === -1) return

    const toArr = arrayFor(overContainer)
    // Look up the drop index BEFORE removing the active item. For a same-container move,
    // fromArr and toArr are the same array reference — finding overId's index after the
    // removal would see a shifted, off-by-one position (dnd-kit's own arrayMove resolves
    // indices up front rather than after mutating, for the same reason).
    const toIndexRaw = overId === overContainer ? toArr.length : toArr.findIndex((f) => f.id === overId)
    const toIndex = toIndexRaw === -1 ? toArr.length : toIndexRaw

    const [moved] = fromArr.splice(fromIndex, 1)
    toArr.splice(toIndex, 0, moved)

    onChange(next)
  }

  const rootIds = fields.map((f) => f.id).filter((id): id is string => Boolean(id))

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center justify-end gap-xs">
        <button
          type="button"
          onClick={() => setPreviewWidth('desktop')}
          aria-label="Preview at desktop width"
          title="Desktop width"
          className={`flex h-8 w-8 items-center justify-center rounded-md ${
            previewWidth === 'desktop' ? 'bg-primary text-text-on-primary' : 'text-text-secondary hover:bg-background'
          }`}
        >
          <Monitor className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPreviewWidth('mobile')}
          aria-label="Preview at mobile width"
          title="Mobile width"
          className={`flex h-8 w-8 items-center justify-center rounded-md ${
            previewWidth === 'mobile' ? 'bg-primary text-text-on-primary' : 'text-text-secondary hover:bg-background'
          }`}
        >
          <Smartphone className="h-4 w-4" />
        </button>
      </div>

      <div
        className={`@container mx-auto rounded-md border border-dashed border-border p-md ${
          previewWidth === 'mobile' ? 'w-96' : 'w-full'
        }`}
      >
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <Container id={ROOT_ID} itemIds={rootIds}>
            {fields.length === 0 && <p className="col-span-6 text-body-sm text-text-secondary">No fields yet.</p>}
            {fields.map((field) =>
              isGroup(field) ? (
                <GroupCard key={field.id} group={field} onRemove={onRemove} onEdit={onEdit} />
              ) : (
                <FieldCard
                  key={field.id}
                  field={field}
                  onRemove={() => onRemove(null, field.id!)}
                  onEdit={() => onEdit(null, field)}
                />
              ),
            )}
          </Container>
        </DndContext>
      </div>
    </div>
  )
}

function Container({ id, itemIds, children }: { id: string; itemIds: string[]; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <SortableContext items={itemIds} strategy={rectSortingStrategy}>
      <div ref={setNodeRef} className="grid grid-cols-6 gap-md">
        {children}
      </div>
    </SortableContext>
  )
}

function GroupCard({
  group,
  onRemove,
  onEdit,
}: {
  group: FormFieldInput
  onRemove: (groupId: string | null, fieldId: string) => void
  onEdit: (groupId: string | null, field: FormFieldInput) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id! })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const children = group.fields ?? []
  const childIds = children.map((f) => f.id).filter((id): id is string => Boolean(id))

  return (
    <div ref={setNodeRef} style={style} className="col-span-6 rounded-md border border-border bg-background p-md">
      <div className="flex items-center gap-sm">
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab text-text-secondary active:cursor-grabbing"
          aria-label={`Drag ${group.label}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <p className="flex-1 text-body-sm font-semibold text-text-primary">{group.label}</p>
        <button
          type="button"
          onClick={() => onEdit(null, group)}
          aria-label={`Edit group ${group.label}`}
          className="text-text-secondary hover:text-primary"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onRemove(null, group.id!)}
          aria-label={`Remove group ${group.label}`}
          className="text-text-secondary hover:text-error"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-sm">
        <Container id={groupContainerId(group.id!)} itemIds={childIds}>
          {children.length === 0 && <p className="col-span-6 text-caption text-text-secondary">Drag fields here.</p>}
          {children.map((field) => (
            <FieldCard
              key={field.id}
              field={field}
              onRemove={() => onRemove(group.id!, field.id!)}
              onEdit={() => onEdit(group.id!, field)}
            />
          ))}
        </Container>
      </div>
    </div>
  )
}

function FieldCard({ field, onRemove, onEdit }: { field: FormFieldInput; onRemove: () => void; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id! })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const widthClass = WIDTH_CLASSES[(field.width as Width | null | undefined) ?? 'full']

  return (
    <div ref={setNodeRef} style={style} className={`${widthClass} rounded-md border border-border bg-surface p-sm`}>
      <div className="flex items-center gap-xs">
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab text-text-secondary active:cursor-grabbing"
          aria-label={`Drag ${field.label}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-caption font-medium text-text-primary">
          {field.label}
          {field.required && <span className="text-error"> *</span>}
        </span>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${field.label}`}
          className="text-text-secondary hover:text-primary"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${field.label}`}
          className="text-text-secondary hover:text-error"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-xs">
        <FieldMockInput field={field} />
      </div>
    </div>
  )
}

// A rough visual stand-in for each field's real input control — enough to judge layout/width at
// a glance, not a functional input (nothing collects real data here; Form Builder only authors
// the template).
function FieldMockInput({ field }: { field: FormFieldInput }) {
  switch (field.type) {
    case 'long_text':
      return <div className="h-16 rounded-md border border-border bg-background" />
    case 'single_select':
    case 'multi_select':
      return (
        <div className="flex h-9 items-center justify-between rounded-md border border-border bg-background px-sm text-caption text-text-secondary">
          <span>{field.type === 'multi_select' ? 'Select multiple…' : 'Select…'}</span>
          <ChevronDown className="h-3 w-3" />
        </div>
      )
    case 'yes_no':
      return (
        <div className="flex gap-xs">
          <span className="rounded-full border border-border px-sm py-xs text-caption text-text-secondary">Yes</span>
          <span className="rounded-full border border-border px-sm py-xs text-caption text-text-secondary">No</span>
        </div>
      )
    case 'date':
      return (
        <div className="flex h-9 items-center justify-between rounded-md border border-border bg-background px-sm text-caption text-text-secondary">
          <span>dd/mm/yyyy</span>
          <Calendar className="h-3 w-3" />
        </div>
      )
    case 'table': {
      const count = field.table_columns?.length ?? 0
      return (
        <div className="rounded-md border border-border bg-background px-sm py-xs text-caption text-text-secondary">
          {count} column{count === 1 ? '' : 's'}
        </div>
      )
    }
    default:
      return <div className="h-9 rounded-md border border-border bg-background" />
  }
}

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Link2, Pencil, X } from 'lucide-react'
import { COMPONENT_TYPE_ICONS, COMPONENT_TYPE_LABELS, type ComponentInput } from '@/lib/planComponents'

// Shared between Plan Templates' step-builder and the live client Plan editor (both build the
// same kind of step out of the same component types) — extracted here rather than duplicated so
// the two don't drift.

// User-requested — for `type=text`, the builder's Label field is optional (called "Title"
// there). Falls back to the type's own display name ("Text", "Checklist", ...) wherever a
// component's own label is blank, purely for presentation — never written back.
function displayLabel(component: ComponentInput) {
  return component.label || COMPONENT_TYPE_LABELS[component.type]
}

export function ComponentBlock({
  component,
  onEdit,
  onRemove,
}: {
  component: ComponentInput
  onEdit: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: component.id! })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const Icon = COMPONENT_TYPE_ICONS[component.type]
  const label = displayLabel(component)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-xs rounded-md border border-border bg-surface p-sm"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab text-text-secondary active:cursor-grabbing"
        aria-label={`Drag ${label}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Icon className="h-4 w-4 shrink-0 text-text-secondary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-medium text-text-primary">{label}</p>
        <p className="text-caption text-text-secondary">{COMPONENT_TYPE_LABELS[component.type]}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${label}`}
        className="text-text-secondary hover:text-primary"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="text-text-secondary hover:text-error"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// User-requested — "when not in edit mode I should be able to see what consultant (while
// processing) sees." A rough visual stand-in for each component's real control — no builder
// chrome, no card border/background, and (user-requested follow-up) no type icon either — this
// is meant to read as plain content, not another builder widget. Reads from `payload` where a
// matching key already exists (seeded components carry real content — `payload.content`/
// `payload.items`/`payload.questions`) and falls back to a generic placeholder for a freshly-added
// component whose payload is still `{}`.
export function ComponentPreview({ component }: { component: ComponentInput }) {
  return (
    <div>
      <span className="text-body-sm font-medium text-text-primary">{displayLabel(component)}</span>
      <div className="mt-xs">
        <ComponentPreviewControl component={component} />
      </div>
    </div>
  )
}

function ComponentPreviewControl({ component }: { component: ComponentInput }) {
  const payload = (component.payload ?? {}) as Record<string, unknown>

  switch (component.type) {
    case 'text': {
      // Plain text, not a boxed control — user-reported ("Why text is inside a textbox?"): this
      // is a note for the consultant to read, not a field they fill in, so it shouldn't look
      // like an input.
      const content = typeof payload.content === 'string' ? payload.content : 'Instructional text for the consultant.'
      return <p className="text-body-sm text-text-secondary">{content}</p>
    }
    case 'file_upload':
      return (
        <div className="flex h-9 items-center justify-between rounded-md border border-dashed border-border bg-background px-3 text-caption text-text-secondary">
          <span>No file uploaded</span>
          <span className="rounded-full border border-border px-sm py-xs text-caption font-medium text-text-primary">
            Upload
          </span>
        </div>
      )
    case 'checklist': {
      const items = Array.isArray(payload.items) ? (payload.items as string[]) : ['Checklist item']
      return (
        <div className="flex flex-col gap-xs">
          {items.map((item, i) => (
            <label key={i} className="flex items-center gap-xs text-body-sm text-text-secondary">
              <input type="checkbox" disabled className="h-4 w-4" />
              {item}
            </label>
          ))}
        </div>
      )
    }
    case 'questionnaire': {
      const questions = Array.isArray(payload.questions) ? (payload.questions as string[]) : ['Question']
      return (
        <div className="flex flex-col gap-sm">
          {questions.map((q, i) => (
            <div key={i} className="flex flex-col gap-[2px]">
              <label className="text-caption text-text-secondary">{q}</label>
              <div className="h-9 rounded-md border border-border bg-background" />
            </div>
          ))}
        </div>
      )
    }
    case 'form_link': {
      const formName = typeof payload.form_name === 'string' && payload.form_name ? payload.form_name : null
      return (
        <div className="flex h-9 w-fit items-center gap-xs rounded-full border border-border bg-background px-sm text-caption font-medium text-text-primary">
          <Link2 className="h-3 w-3" />
          {formName ? `Open "${formName}"` : 'Open Form'}
        </div>
      )
    }
    default:
      return <div className="h-9 rounded-md border border-border bg-background" />
  }
}

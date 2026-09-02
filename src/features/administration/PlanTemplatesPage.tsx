import { useMemo, useState } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Copy, Eye, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { TextField } from '@/components/TextField'
import { Table, type TableColumn } from '@/components/Table'
import { ComponentBlock, ComponentPreview } from '@/components/PlanComponentBlock'
import { AddStepModal, type StepDraft } from '@/components/AddStepModal'
import { AddComponentModal } from '@/components/AddComponentModal'
import { StopPropagation } from '@/components/StopPropagation'
import {
  useCreatePlanTemplate,
  useDuplicatePlanTemplate,
  usePlanTemplates,
  useUpdatePlanTemplate,
} from '@/queries/plans'
import { formatDate } from '@/lib/time'
import type { ComponentInput } from '@/lib/planComponents'
import type { components } from '@/api/schema'

type StepTemplateInput = components['schemas']['StepTemplateInput']
type PlanTemplate = components['schemas']['PlanTemplate']

// User-requested rework — "just like a Wordpress page setup.. the already mentioned components
// can be added multiple times... I should be able to edit the steps, if I want to... Don't want
// a checkbox to select which component." Replaces the old single-column "Add Step" card (which
// baked a fixed 0-or-1-of-each-type checkbox set into step creation, with no way to edit an
// existing step) with a two-panel layout — Steps on the left, the selected step's own detail
// (title, duration, and a WordPress-block-style Components list) on the right. Loosely inspired
// by a screenshot of the user's other product (their own reference, not this app's spec) for the
// numbered-step / detail-panel shape; its "Stage Type" badge aren't part of this schema/build
// reference, so it wasn't replicated — flagged in PROGRESS.md as a deliberate scope call, not an
// oversight. An Edit/Preview mode toggle (user-requested — "when not in edit mode I should be
// able to see what consultant (while processing) sees") swaps the builder chrome for a read-only
// mock of each component's real control, the same idea as Form Builder's field mock preview.
function TemplateEditor({ template, onDone }: { template: PlanTemplate | null; onDone: () => void }) {
  const createTemplate = useCreatePlanTemplate()
  const updateTemplate = useUpdatePlanTemplate()
  const [name, setName] = useState(template?.name ?? '')
  const [steps, setSteps] = useState<StepTemplateInput[]>(
    template?.steps.map((s) => ({
      id: s.id,
      title: s.title,
      expected_duration_days: s.expected_duration_days,
      components: s.components,
    })) ?? [],
  )
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>(steps[0]?.id)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [showAddStep, setShowAddStep] = useState(false)
  const [editingStep, setEditingStep] = useState<StepTemplateInput | null>(null)
  const [showAddComponent, setShowAddComponent] = useState(false)
  const [editingComponent, setEditingComponent] = useState<ComponentInput | null>(null)

  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? null

  function addStep(draft: StepDraft) {
    const id = crypto.randomUUID()
    setSteps((prev) => [
      ...prev,
      { id, title: draft.title, expected_duration_days: draft.expected_duration_days, components: [] },
    ])
    setSelectedStepId(id)
  }

  function updateStep(id: string, draft: StepDraft) {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, title: draft.title, expected_duration_days: draft.expected_duration_days } : s,
      ),
    )
  }

  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id))
    setSelectedStepId((prev) => (prev === id ? undefined : prev))
  }

  function handleStepDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSteps((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id)
      const newIndex = prev.findIndex((s) => s.id === over.id)
      return oldIndex === -1 || newIndex === -1 ? prev : arrayMove(prev, oldIndex, newIndex)
    })
  }

  function addComponent(component: ComponentInput) {
    if (!selectedStepId) return
    setSteps((prev) =>
      prev.map((s) => (s.id === selectedStepId ? { ...s, components: [...(s.components ?? []), component] } : s)),
    )
  }

  function updateComponent(componentId: string, updated: ComponentInput) {
    if (!selectedStepId) return
    setSteps((prev) =>
      prev.map((s) =>
        s.id === selectedStepId
          ? { ...s, components: (s.components ?? []).map((c) => (c.id === componentId ? updated : c)) }
          : s,
      ),
    )
  }

  function removeComponent(componentId: string) {
    if (!selectedStepId) return
    setSteps((prev) =>
      prev.map((s) =>
        s.id === selectedStepId ? { ...s, components: (s.components ?? []).filter((c) => c.id !== componentId) } : s,
      ),
    )
  }

  function handleComponentDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !selectedStepId) return
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== selectedStepId) return s
        const comps = s.components ?? []
        const oldIndex = comps.findIndex((c) => c.id === active.id)
        const newIndex = comps.findIndex((c) => c.id === over.id)
        return oldIndex === -1 || newIndex === -1 ? s : { ...s, components: arrayMove(comps, oldIndex, newIndex) }
      }),
    )
  }

  function handleSave() {
    if (!name || steps.length === 0) return
    if (template) {
      updateTemplate.mutate({ id: template.id, name, steps }, { onSuccess: onDone })
    } else {
      createTemplate.mutate({ name, steps }, { onSuccess: onDone })
    }
  }

  const saving = createTemplate.isPending || updateTemplate.isPending
  const error = createTemplate.error ?? updateTemplate.error
  const selectedIndex = selectedStep ? steps.findIndex((s) => s.id === selectedStep.id) : -1

  return (
    <Card className="flex flex-col gap-md">
      <TextField label="Template name" value={name} onChange={(e) => setName(e.target.value)} />

      <div className="flex items-center justify-end gap-xs">
        <button
          type="button"
          onClick={() => setMode('edit')}
          aria-label="Edit mode"
          title="Edit"
          className={`flex h-8 w-8 items-center justify-center rounded-md ${
            mode === 'edit' ? 'bg-primary text-text-on-primary' : 'text-text-secondary hover:bg-background'
          }`}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setMode('preview')}
          aria-label="Preview mode — what the consultant sees while processing"
          title="Preview"
          className={`flex h-8 w-8 items-center justify-center rounded-md ${
            mode === 'preview' ? 'bg-primary text-text-on-primary' : 'text-text-secondary hover:bg-background'
          }`}
        >
          <Eye className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-[320px_1fr] gap-md">
        <div className="flex flex-col gap-sm rounded-md border border-border p-md">
          <div className="flex items-center justify-between">
            <p className="text-body-sm font-medium text-text-primary">Steps</p>
            {mode === 'edit' && (
              <Button type="button" variant="secondary" onClick={() => setShowAddStep(true)}>
                Add Step
              </Button>
            )}
          </div>
          {steps.length === 0 && <p className="text-body-sm text-text-secondary">No steps yet.</p>}
          {mode === 'edit' ? (
            <DndContext collisionDetection={closestCenter} onDragEnd={handleStepDragEnd}>
              <SortableContext items={steps.map((s) => s.id!)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-xs">
                  {steps.map((step, i) => (
                    <StepRow
                      key={step.id}
                      step={step}
                      index={i}
                      selected={step.id === selectedStepId}
                      onSelect={() => setSelectedStepId(step.id)}
                      onRemove={() => removeStep(step.id!)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="flex flex-col gap-xs">
              {steps.map((step, i) => (
                <StepPreviewRow
                  key={step.id}
                  step={step}
                  index={i}
                  selected={step.id === selectedStepId}
                  onSelect={() => setSelectedStepId(step.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-md border border-border p-md">
          {!selectedStep && (
            <p className="text-body-sm text-text-secondary">Select a step to configure its components.</p>
          )}
          {selectedStep && (
            <div className="flex flex-col gap-md">
              <div className="flex items-center gap-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-body-sm font-semibold text-text-on-primary">
                  {selectedIndex + 1}
                </span>
                <p className="flex-1 text-h3 text-text-primary">{selectedStep.title}</p>
                {mode === 'edit' && (
                  <button
                    type="button"
                    onClick={() => setEditingStep(selectedStep)}
                    aria-label={`Edit ${selectedStep.title}`}
                    className="text-text-secondary hover:text-primary"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
              {selectedStep.expected_duration_days != null && (
                <p className="text-caption text-text-secondary">
                  Expected duration: {selectedStep.expected_duration_days} day
                  {selectedStep.expected_duration_days === 1 ? '' : 's'}
                </p>
              )}

              {mode === 'edit' && (
                <div className="flex justify-end">
                  <Button type="button" variant="secondary" onClick={() => setShowAddComponent(true)}>
                    Add Component
                  </Button>
                </div>
              )}
              {(selectedStep.components ?? []).length === 0 && (
                <p className="text-body-sm text-text-secondary">No components yet.</p>
              )}
              {mode === 'edit' ? (
                <DndContext collisionDetection={closestCenter} onDragEnd={handleComponentDragEnd}>
                  <SortableContext
                    items={(selectedStep.components ?? []).map((c) => c.id!)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex flex-col gap-xs">
                      {(selectedStep.components ?? []).map((component) => (
                        <ComponentBlock
                          key={component.id}
                          component={component}
                          onEdit={() => setEditingComponent(component)}
                          onRemove={() => removeComponent(component.id!)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="flex flex-col gap-md">
                  {(selectedStep.components ?? []).map((component) => (
                    <ComponentPreview key={component.id} component={component} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-body-sm text-error">{error.message}</p>}

      <div className="flex gap-sm">
        <Button onClick={handleSave} loading={saving} disabled={!name || steps.length === 0}>
          {template ? 'Save Changes' : 'Create Template'}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>

      {showAddStep && <AddStepModal onSubmit={addStep} onClose={() => setShowAddStep(false)} />}
      {editingStep && (
        <AddStepModal
          editingStep={{ title: editingStep.title, expected_duration_days: editingStep.expected_duration_days }}
          onSubmit={(draft) => updateStep(editingStep.id!, draft)}
          onClose={() => setEditingStep(null)}
        />
      )}
      {showAddComponent && <AddComponentModal onSubmit={addComponent} onClose={() => setShowAddComponent(false)} />}
      {editingComponent && (
        <AddComponentModal
          editingComponent={editingComponent}
          onSubmit={(updated) => updateComponent(editingComponent.id!, updated)}
          onClose={() => setEditingComponent(null)}
        />
      )}
    </Card>
  )
}

// User-requested — "we do not want edit on the movable piece. as there is edit in the right
// panel" — the row itself only drags, selects, and deletes; editing a step lives solely in the
// detail panel's own pencil icon now. Delete is a trash icon (was a plain X) gated behind a
// confirm popup, same shape as Branches' Deactivate confirm — wrapping the trigger+modal in its
// own stopPropagation div, since Modal isn't a portal and an unguarded click inside it would
// otherwise bubble up and re-select the row.
function StepRow({
  step,
  index,
  selected,
  onSelect,
  onRemove,
}: {
  step: StepTemplateInput
  index: number
  selected: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id! })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const count = step.components?.length ?? 0
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    // role/tabIndex/onKeyDown make the card keyboard-selectable — it can't BE a <button> because
    // it hosts the drag handle and delete <button>s (nested interactive elements are invalid).
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={`flex cursor-pointer items-center gap-xs rounded-md border p-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
        selected ? 'border-primary bg-primary-subtle' : 'border-border bg-surface hover:bg-background'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab text-text-secondary active:cursor-grabbing"
        aria-label={`Drag ${step.title}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-caption font-semibold text-text-secondary">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-medium text-text-primary">{step.title}</p>
        <p className="text-caption text-text-secondary">
          {count} component{count === 1 ? '' : 's'}
        </p>
      </div>
      <StopPropagation>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label={`Delete ${step.title}`}
          className="text-text-secondary hover:text-error"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {confirmDelete && (
          <Modal
            onClose={() => setConfirmDelete(false)}
            title="Delete Step"
            widthRem={24}
            footer={
              <div className="flex gap-sm">
                <Button
                  variant="destructive"
                  onClick={() => {
                    onRemove()
                    setConfirmDelete(false)
                  }}
                >
                  Delete
                </Button>
                <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            }
          >
            <p className="text-body-sm text-text-secondary">
              Delete <strong className="text-text-primary">{step.title}</strong>
              {count > 0 && (
                <>
                  {' '}
                  and its {count} component{count === 1 ? '' : 's'}
                </>
              )}
              ? This can&apos;t be undone.
            </p>
          </Modal>
        )}
      </StopPropagation>
    </div>
  )
}

// Preview mode's Steps list — no drag handle, no delete, just click-to-browse. A plain div, not
// a `useSortable` item, since nothing here is draggable while previewing.
function StepPreviewRow({
  step,
  index,
  selected,
  onSelect,
}: {
  step: StepTemplateInput
  index: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    // Only spans/text inside — no nested interactive content like the editable StepRow above
    // (which hosts a drag handle and delete button and so must stay a div+role="button") — so
    // this can be a real <button> instead of the div+role="button" workaround.
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-center gap-xs rounded-md border p-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
        selected ? 'border-primary bg-primary-subtle' : 'border-border bg-surface hover:bg-background'
      }`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-caption font-semibold text-text-secondary">
        {index + 1}
      </span>
      <p className="min-w-0 flex-1 truncate text-body-sm font-medium text-text-primary">{step.title}</p>
    </button>
  )
}

type DuplicatePlanTemplate = ReturnType<typeof useDuplicatePlanTemplate>

// Row-level so the confirm popup's own `useState` has somewhere to live — TableColumn's
// `render: (row) => ...` runs as a callback, not a component body, so hooks can't go directly
// inside it (Rules of Hooks). Same icon-actions + confirm-before-duplicate shape as Forms'
// `FormRowActions`, except Edit opens the in-page editor via a callback rather than navigating
// to a route, since Plan Templates doesn't have a separate edit page.
function PlanRowActions({
  template,
  duplicateTemplate,
  onEdit,
}: {
  template: PlanTemplate
  duplicateTemplate: DuplicatePlanTemplate
  onEdit: () => void
}) {
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)

  return (
    <div className="flex justify-end gap-xs">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${template.name}`}
        title="Edit"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setConfirmDuplicate(true)}
        aria-label={`Duplicate ${template.name}`}
        title="Duplicate"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Copy className="h-4 w-4" />
      </button>

      {confirmDuplicate && (
        <Modal
          onClose={() => setConfirmDuplicate(false)}
          title="Duplicate Plan Template"
          widthRem={24}
          footer={
            <>
              {duplicateTemplate.isError && (
                <p className="mr-auto self-center text-body-sm text-error">{duplicateTemplate.error.message}</p>
              )}
              <div className="flex gap-sm">
                <Button
                  loading={duplicateTemplate.isPending}
                  onClick={() => duplicateTemplate.mutate(template.id, { onSuccess: () => setConfirmDuplicate(false) })}
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
          <p className="text-body-sm text-text-secondary">
            This creates a new, independent copy of <strong className="text-text-primary">{template.name}</strong> —
            editing one won&apos;t affect the other.
          </p>
        </Modal>
      )}
    </div>
  )
}

export function PlanTemplatesPage() {
  const templates = usePlanTemplates()
  const duplicateTemplate = useDuplicatePlanTemplate()
  const [editing, setEditing] = useState<PlanTemplate | null | 'new'>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    let items = templates.data ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((t) => t.name.toLowerCase().includes(q))
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av =
          sort.field === 'steps' ? a.steps.length : sort.field === 'updated_at' ? a.updated_at : a.name.toLowerCase()
        const bv =
          sort.field === 'steps' ? b.steps.length : sort.field === 'updated_at' ? b.updated_at : b.name.toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [templates.data, search, sort])

  const columns: TableColumn<PlanTemplate>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (t) => <span className="font-medium text-text-primary">{t.name}</span>,
    },
    { key: 'steps', header: 'Steps', sortable: true, align: 'right', render: (t) => t.steps.length },
    { key: 'updated_at', header: 'Last edited', sortable: true, render: (t) => formatDate(t.updated_at) },
    {
      key: 'actions',
      header: '',
      render: (t) => <PlanRowActions template={t} duplicateTemplate={duplicateTemplate} onEdit={() => setEditing(t)} />,
    },
  ]

  if (editing !== null) {
    return (
      <AppShell>
        <div className="flex flex-col gap-lg">
          <h1 className="text-h1 text-text-primary">
            {editing === 'new' ? 'New Plan Template' : 'Edit Plan Template'}
          </h1>
          <TemplateEditor template={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-h1 text-text-primary">Plan Templates</h1>
          <Button onClick={() => setEditing('new')}>Create New</Button>
        </div>

        <Table
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          loading={templates.isLoading}
          error={templates.isError ? 'Could not load plan templates.' : undefined}
          emptyMessage={
            search
              ? 'No templates match your search.'
              : 'No plan templates yet. Create one to reuse the same steps across clients.'
          }
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search templates…' }}
        />
      </div>
    </AppShell>
  )
}

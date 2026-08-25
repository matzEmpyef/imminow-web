import { useState, type FormEvent } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { Badge } from './Badge'
import { Modal } from './Modal'
import { TextField } from './TextField'
import { ComponentBlock } from './PlanComponentBlock'
import { ComponentFill } from './ComponentFill'
import { AddStepModal, type StepDraft } from './AddStepModal'
import { AddComponentModal } from './AddComponentModal'
import { ErrorState, Skeleton } from './QueryState'
import { StopPropagation } from './StopPropagation'
import { useAddStep, useDeleteStep, usePlan, useReorderSteps, useUpdateStep } from '@/queries/plans'
import { useApproveStep, useRejectStep } from '@/queries/steps'
import { usePermission } from '@/lib/permissions'
import { formatDate, formatDateTime } from '@/lib/time'
import type { ComponentInput } from '@/lib/planComponents'
import type { components } from '@/api/schema'

type Step = components['schemas']['Step']

// Ported from the now-retired standalone Step Approvals page (user-requested, 2026-08-19 —
// "instead of separate page show it activities... redirect to client plan tab and to the
// specific step") — same read-only rendering of whatever shape the applicant's submission took.
function SubmissionPreview({ submission }: { submission: Record<string, unknown> | null | undefined }) {
  if (!submission) return null
  const checklist = submission.checklist as Record<string, boolean> | undefined
  const questionnaire = submission.questionnaire as Record<string, string> | undefined
  const files = submission.files as string[] | undefined

  return (
    <div className="flex flex-col gap-xs text-body-sm">
      {checklist && (
        <div>
          <p className="font-medium text-text-primary">Checklist</p>
          {Object.entries(checklist).map(([item, checked]) => (
            <p key={item} className="text-text-secondary">
              {checked ? '✓' : '○'} {item}
            </p>
          ))}
        </div>
      )}
      {questionnaire && (
        <div>
          <p className="font-medium text-text-primary">Questionnaire</p>
          {Object.entries(questionnaire).map(([question, answer]) => (
            <p key={question} className="text-text-secondary">
              {question} — <span className="text-text-primary">{answer}</span>
            </p>
          ))}
        </div>
      )}
      {files && files.length > 0 && (
        <div>
          <p className="font-medium text-text-primary">Files</p>
          {files.map((f) => (
            <p key={f} className="text-text-secondary">
              📄 {f}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// Approve/Send Back for a step awaiting review (status active + submitted_at set) — moved here
// from the retired standalone Step Approvals page, since that page no longer exists and this is
// the step's own detail panel, the natural place for its own pending-review actions to live.
function StepApprovalActions({ step, clientId }: { step: Step; clientId: string }) {
  const approve = useApproveStep(clientId)
  const reject = useRejectStep(clientId)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  // Server enforces step_review.confirm_send_back on POST /steps/:id/approve and /reject —
  // without this gate a denied consultant sees the buttons and gets a 403 on click.
  const canReview = usePermission('step_review.confirm_send_back')

  return (
    <div className="flex flex-col gap-md rounded-md border border-warning bg-warning-subtle p-md">
      <div className="flex items-center justify-between">
        <p className="text-body-sm font-medium text-text-primary">
          {canReview ? 'Awaiting your review' : 'Awaiting review'}
        </p>
        <span className="text-caption text-text-secondary">
          Submitted {step.submitted_at && formatDateTime(step.submitted_at)}
        </span>
      </div>
      <SubmissionPreview submission={step.submission} />
      {canReview &&
        (rejecting ? (
          <div className="flex items-end gap-sm">
            <TextField
              label="Reason (shown to the applicant)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="destructive"
              disabled={!reason}
              loading={reject.isPending}
              onClick={() =>
                reject.mutate(
                  { stepId: step.id, reason },
                  {
                    onSuccess: () => {
                      setRejecting(false)
                      setReason('')
                    },
                  },
                )
              }
            >
              Confirm Send Back
            </Button>
            <Button variant="secondary" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-sm">
            <Button loading={approve.isPending} onClick={() => approve.mutate(step.id)}>
              Confirm Complete
            </Button>
            <Button variant="secondary" onClick={() => setRejecting(true)}>
              Send Back
            </Button>
          </div>
        ))}
      {(approve.error ?? reject.error) && (
        <p className="text-body-sm text-error">{(approve.error ?? reject.error)?.message}</p>
      )}
    </div>
  )
}

const STATUS_COLOR = { locked: 'secondary', active: 'info', done: 'success' } as const

// A live Step edits its date, not a duration count (`Step.expected_end_date`, unlike
// `StepTemplateInput.expected_duration_days`) — its own small modal rather than reusing the
// shared `AddStepModal`, which is duration-based and only fits step *creation* here (`useAddStep`
// still takes `expected_duration_days`, same as Plan Templates).
function EditLiveStepModal({
  step,
  onSubmit,
  onClose,
}: {
  step: Step
  onSubmit: (data: { title: string; expected_end_date: string | null }) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(step.title)
  const [date, setDate] = useState(step.expected_end_date ? step.expected_end_date.slice(0, 10) : '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title) return
    onSubmit({ title, expected_end_date: date ? new Date(date).toISOString() : null })
    onClose()
  }

  return (
    <Modal
      onClose={onClose}
      title="Edit Step"
      widthRem={28}
      footer={
        <Button type="submit" form="edit-live-step-form" disabled={!title}>
          Save Changes
        </Button>
      }
    >
      <form id="edit-live-step-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Step title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField label="Expected end date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </form>
    </Modal>
  )
}

// User-requested follow-up (2026-08-15) on the Plan Template step-builder rework — "Hope what
// you have done is for client plan also." Same two-panel shape and WordPress-style repeatable
// Add Component popup as Plan Templates, but every mutating control (Edit step, Add/Edit/Remove
// Component, Delete step) is restricted to steps still `locked` — once a step goes `active` the
// student may already be working in it, so its components become fixed (server-enforced 409 on
// `PATCH`/`DELETE /steps/{id}`, this is just the UI reflecting that same rule). Reordering keeps
// its own pre-existing, less strict rule (blocked only once `done`, unrelated to this rework).
// Unlike Plan Templates, every action here persists immediately — there's no local "staged"
// draft or a page-level Save, matching how `useAddStep`/`useReorderSteps` already worked.
function LiveStepRow({
  step,
  index,
  selected,
  onSelect,
  onDelete,
}: {
  step: Step
  index: number
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
    disabled: step.status === 'done',
  })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const [confirmDelete, setConfirmDelete] = useState(false)
  const count = step.components.length

  return (
    // role/tabIndex/onKeyDown make the card keyboard-selectable, same treatment Card.tsx gives
    // its own clickable instances — it can't BE a <button> because it hosts the drag handle and
    // delete <button>s (nested interactive elements are invalid inside a button).
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
        disabled={step.status === 'done'}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab text-text-secondary active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
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
      <Badge color={STATUS_COLOR[step.status]}>{step.status}</Badge>
      {step.status === 'locked' && (
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
                      onDelete()
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
      )}
    </div>
  )
}

function LiveStepPreviewRow({
  step,
  index,
  selected,
  onSelect,
}: {
  step: Step
  index: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={`flex cursor-pointer items-center gap-xs rounded-md border p-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
        selected ? 'border-primary bg-primary-subtle' : 'border-border bg-surface hover:bg-background'
      }`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-caption font-semibold text-text-secondary">
        {index + 1}
      </span>
      <p className="min-w-0 flex-1 truncate text-body-sm font-medium text-text-primary">{step.title}</p>
      <Badge color={STATUS_COLOR[step.status]}>{step.status}</Badge>
    </div>
  )
}

// Extracted from the former standalone Plan Editor page (user-requested, 2026-08-15 — "In plan
// tab show the full plan just like in template page ... default is preview mode") so the Plan
// tab can show the whole step-builder inline instead of linking out. Defaults to Preview — the
// consultant sees exactly what the student sees — with the same Edit-mode toggle Plan Templates
// itself has.
export function PlanStepBuilder({ clientId, initialStepId }: { clientId: string; initialStepId?: string }) {
  const plan = usePlan(clientId)
  const addStep = useAddStep(clientId)
  const updateStep = useUpdateStep(clientId)
  const deleteStep = useDeleteStep(clientId)
  const reorder = useReorderSteps(clientId)

  // Defaults to whichever step Activity's Step Approvals row deep-linked here (user-requested,
  // 2026-08-19 — "redirect to client plan tab and to the specific step"), falling back to the
  // active step (user-requested, 2026-08-15 — "open active step be default") when there's no
  // deep-link, rather than nothing selected. Lazy initializer only, not an effect — this only
  // needs to run once on mount; PlanTab already guards on plan.data existing before rendering this
  // component at all, so it's already in the query cache here.
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>(
    () => initialStepId ?? plan.data?.steps.find((s) => s.status === 'active')?.id,
  )
  const [mode, setMode] = useState<'edit' | 'preview'>('preview')
  const [showAddStep, setShowAddStep] = useState(false)
  const [editingStep, setEditingStep] = useState<Step | null>(null)
  const [showAddComponent, setShowAddComponent] = useState(false)
  const [editingComponent, setEditingComponent] = useState<ComponentInput | null>(null)
  // Every edit affordance (Add Step, delete, drag reorder, component editing) keys off
  // mode === 'edit', so gating the toggle gates the whole edit surface in one place. Mirrors
  // the clients.edit_plan enforcement on the server's plan-mutation routes.
  const canEditPlan = usePermission('clients.edit_plan')

  if (plan.isLoading) return <Skeleton className="h-24 rounded-lg" />
  // usePlan sets retry: false, so this Retry button is genuinely the only recovery path here.
  if (plan.isError || !plan.data)
    return <ErrorState message="Could not load the plan." onRetry={() => plan.refetch()} />

  const steps = [...plan.data.steps].sort((a, b) => a.position - b.position)
  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? null
  const selectedIndex = selectedStep ? steps.findIndex((s) => s.id === selectedStep.id) : -1
  const canEdit = mode === 'edit' && selectedStep?.status === 'locked'
  const mutationError = addStep.error ?? updateStep.error ?? deleteStep.error ?? reorder.error

  function handleStepDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = steps.findIndex((s) => s.id === active.id)
    const newIndex = steps.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    reorder.mutate(arrayMove(steps, oldIndex, newIndex).map((s) => s.id))
  }

  function handleComponentDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !selectedStep) return
    const comps = selectedStep.components
    const oldIndex = comps.findIndex((c) => c.id === active.id)
    const newIndex = comps.findIndex((c) => c.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    updateStep.mutate({ stepId: selectedStep.id, components: arrayMove(comps, oldIndex, newIndex) })
  }

  function handleAddStep(draft: StepDraft) {
    addStep.mutate(
      { title: draft.title, expected_duration_days: draft.expected_duration_days },
      { onSuccess: (newStep) => setSelectedStepId(newStep?.id) },
    )
  }

  function handleDeleteStep(step: Step) {
    deleteStep.mutate(step.id, {
      onSuccess: () => setSelectedStepId((prev) => (prev === step.id ? undefined : prev)),
    })
  }

  function addComponentToStep(component: ComponentInput) {
    if (!selectedStep) return
    updateStep.mutate({ stepId: selectedStep.id, components: [...selectedStep.components, component] })
  }

  function updateComponentInStep(componentId: string, updated: ComponentInput) {
    if (!selectedStep) return
    updateStep.mutate({
      stepId: selectedStep.id,
      components: selectedStep.components.map((c) => (c.id === componentId ? updated : c)),
    })
  }

  function removeComponentFromStep(componentId: string) {
    if (!selectedStep) return
    updateStep.mutate({
      stepId: selectedStep.id,
      components: selectedStep.components.filter((c) => c.id !== componentId),
    })
  }

  return (
    <Card className="flex flex-col gap-md">
      {canEditPlan && (
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
      )}

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
              <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-xs">
                  {steps.map((step, i) => (
                    <LiveStepRow
                      key={step.id}
                      step={step}
                      index={i}
                      selected={step.id === selectedStepId}
                      onSelect={() => setSelectedStepId(step.id)}
                      onDelete={() => handleDeleteStep(step)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="flex flex-col gap-xs">
              {steps.map((step, i) => (
                <LiveStepPreviewRow
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
          {!selectedStep && <p className="text-body-sm text-text-secondary">Select a step to view its components.</p>}
          {selectedStep && (
            <div className="flex flex-col gap-md">
              <div className="flex items-center gap-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-body-sm font-semibold text-text-on-primary">
                  {selectedIndex + 1}
                </span>
                <p className="flex-1 text-h3 text-text-primary">{selectedStep.title}</p>
                <Badge color={STATUS_COLOR[selectedStep.status]}>{selectedStep.status}</Badge>
                {canEdit && (
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
              {selectedStep.expected_end_date && (
                <p className="text-caption text-text-secondary">
                  Expected by {formatDate(selectedStep.expected_end_date)}
                </p>
              )}

              {/* Visible regardless of Edit/Preview mode — this is a review workflow action, not
                  a plan-structure edit. Deep-linked here directly from Activity's Step Approvals
                  row (user-requested, 2026-08-19). */}
              {selectedStep.status === 'active' && selectedStep.submitted_at && (
                <StepApprovalActions step={selectedStep} clientId={clientId} />
              )}
              {/* A step sent back keeps its reason visible here until the applicant resubmits and
                  it's approved again (cleared server-side on approve) — previously stored but
                  never rendered anywhere (found 2026-08-19, building this section). */}
              {selectedStep.rejection_reason && (
                <p className="text-body-sm text-error">Sent back: {selectedStep.rejection_reason}</p>
              )}

              {canEdit && (
                <div className="flex justify-end">
                  <Button type="button" variant="secondary" onClick={() => setShowAddComponent(true)}>
                    Add Component
                  </Button>
                </div>
              )}
              {mode === 'edit' && selectedStep.status !== 'locked' && (
                <p className="text-caption text-text-secondary">
                  {selectedStep.status === 'active' ? 'This step has already started' : 'This step is complete'} —
                  components can no longer be edited.
                </p>
              )}
              {selectedStep.components.length === 0 && (
                <p className="text-body-sm text-text-secondary">No components yet.</p>
              )}
              {canEdit ? (
                <DndContext collisionDetection={closestCenter} onDragEnd={handleComponentDragEnd}>
                  <SortableContext
                    items={selectedStep.components.map((c) => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex flex-col gap-xs">
                      {selectedStep.components.map((component) => (
                        <ComponentBlock
                          key={component.id}
                          component={component}
                          onEdit={() => setEditingComponent(component)}
                          onRemove={() => removeComponentFromStep(component.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                // FILLABLE, not a static mock (user, 2026-08-20: "both consultant and applicant
                // should be able to fill the page and save it") — a live plan has real fill
                // state in `Step.responses`, shared with the mobile app. Only the active step
                // accepts changes; locked/done steps show the saved state inert. Plan Templates
                // keeps the static `ComponentPreview` — no live step exists there.
                <div className="flex flex-col gap-md">
                  {selectedStep.components.map((component) => (
                    <ComponentFill
                      key={component.id}
                      component={component}
                      step={selectedStep}
                      clientId={clientId}
                      disabled={selectedStep.status !== 'active'}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {mutationError && <p className="text-body-sm text-error">{mutationError.message}</p>}

      {showAddStep && <AddStepModal onSubmit={handleAddStep} onClose={() => setShowAddStep(false)} />}
      {editingStep && (
        <EditLiveStepModal
          step={editingStep}
          onSubmit={(data) => updateStep.mutate({ stepId: editingStep.id, ...data })}
          onClose={() => setEditingStep(null)}
        />
      )}
      {showAddComponent && (
        <AddComponentModal onSubmit={addComponentToStep} onClose={() => setShowAddComponent(false)} />
      )}
      {editingComponent && (
        <AddComponentModal
          editingComponent={editingComponent}
          onSubmit={(updated) => updateComponentInStep(editingComponent.id!, updated)}
          onClose={() => setEditingComponent(null)}
        />
      )}
    </Card>
  )
}

import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'

export interface StepDraft {
  title: string
  expected_duration_days?: number
}

// User-requested rework — "I should be able to edit the steps, if I want to." A step's own
// title/duration are edited the same way a field/group is in Form Builder: this popup doubles as
// both Add Step and Edit Step depending on whether `editingStep` is supplied, pre-filling and
// swapping the title/submit label — no separate edit UI to maintain. Component management
// (the actual WordPress-block-style part of this rework) happens afterward in the step's own
// detail panel, not here — a step can be created with zero components and built out from there.
// Shared between Plan Templates and the live client Plan editor (adding a step to either takes
// the same title + duration-in-days shape) — editing an already-*assigned* live step uses its
// own modal instead, since a live `Step` has a real `expected_end_date`, not a duration count.
export function AddStepModal({
  editingStep,
  onSubmit,
  onClose,
}: {
  editingStep?: StepDraft
  onSubmit: (step: StepDraft) => void
  onClose: () => void
}) {
  const isEditing = Boolean(editingStep)
  const [title, setTitle] = useState(editingStep?.title ?? '')
  const [duration, setDuration] = useState(
    editingStep?.expected_duration_days != null ? String(editingStep.expected_duration_days) : '',
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title) return
    onSubmit({ title, expected_duration_days: duration ? Number(duration) : undefined })
    onClose()
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Step' : 'Add Step'}
      widthRem={28}
      footer={
        <Button type="submit" form="add-step-form" disabled={!title}>
          {isEditing ? 'Save Changes' : 'Add Step'}
        </Button>
      }
    >
      <form id="add-step-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Step title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField
          label="Expected duration (days)"
          type="number"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
      </form>
    </Modal>
  )
}

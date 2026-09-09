import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { FieldLabel } from '@/components/FieldLabel'

export interface StepDraft {
  title: string
  // What happens in this step, in the consultant's own words (user, 2026-09-09). A title is a
  // label — "Profile Evaluation" tells a student nothing — and this is the sentence that says what
  // it actually involves. Optional: a step nobody described simply has none.
  description?: string | null
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
  const [description, setDescription] = useState(editingStep?.description ?? '')
  const [duration, setDuration] = useState(
    editingStep?.expected_duration_days != null ? String(editingStep.expected_duration_days) : '',
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title) return
    onSubmit({
      title,
      description: description.trim() || null,
      expected_duration_days: duration ? Number(duration) : undefined,
    })
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
        <div className="flex flex-col gap-xs">
          <FieldLabel htmlFor="step-description">What happens in this step</FieldLabel>
          <textarea
            id="step-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="We collect your passport, transcripts and test scores and check each one is readable and in date."
            className="rounded-md border border-border bg-surface p-sm text-body text-text-primary"
          />
          <p className="text-caption text-text-secondary">
            One or two lines the student reads under the step title.
          </p>
        </div>
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

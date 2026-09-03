// Split out of QuizAdminPage.tsx (Phase 3 plan, Tier B3, 2026-09-03) — pure movement unless noted.
import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { Modal } from '@/components/Modal'
import { type QuizQuestionInput, type PositionPrize, MIN_OPTIONS, MAX_OPTIONS } from './quizShared'

// Reworked (user-requested, 2026-08-16 — "we need more space for questions and options... remove
// button, make it icon and align it to right and confirm before deleting question. we should be
// able to give upto 6 options"). Question text gets its own full-width row; options stack one per
// row so each option's text field isn't squeezed; Remove is a Trash2 icon in the top-right corner,
// confirm-gated like Void Quiz already is. Options can now grow up to MAX_OPTIONS (a `+ Add
// option` control) and shrink back down to MIN_OPTIONS (a per-row X, hidden once at the floor) —
// previously fixed at exactly 4 with no way to add more, even though the schema always allowed up
// to 6. Follow-up same day — "question textbox needs to be full width. delete icon be on line
// above the question, on right top corner. 2 options per row layout": Trash2 moved onto its own
// row above the question text (was inline beside it, which was actually narrowing the text field);
// options now render 2-per-row in a grid instead of one full-width row each. One more same-day
// follow-up — "let options take 50% each of the row too. max-width can be 50-52rem" — widened the
// modal 44→50rem (`grid-cols-2` already splits the row exactly 50/50 by fr-unit, confirmed via
// bounding-rect checks; `w-full` added to each option row defensively so that stays true at any
// modal width, not just the one tested).
export function QuestionEditor({
  question,
  index,
  onChange,
  onRemove,
}: {
  question: QuizQuestionInput
  index: number
  onChange: (q: QuizQuestionInput) => void
  onRemove: () => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const options = question.options ?? []

  function setOption(i: number, value: string) {
    const next = [...options]
    next[i] = value
    onChange({ ...question, options: next })
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return
    onChange({ ...question, options: [...options, ''] })
  }

  function removeOption(i: number) {
    if (options.length <= MIN_OPTIONS) return
    const next = options.filter((_, idx) => idx !== i)
    const correct =
      question.correct_option === i
        ? 0
        : question.correct_option > i
          ? question.correct_option - 1
          : question.correct_option
    onChange({ ...question, options: next, correct_option: correct })
  }

  return (
    <div className="flex flex-col gap-md rounded-md border border-border p-md">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          aria-label={`Remove question ${index + 1}`}
          title="Remove question"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <TextField
        label={`Question ${index + 1}`}
        value={question.text}
        onChange={(e) => onChange({ ...question, text: e.target.value })}
        className="w-full"
      />

      <div className="grid grid-cols-2 gap-sm">
        {options.map((opt, i) => (
          <div key={i} className="flex w-full items-center gap-xs">
            <input
              type="radio"
              name={`correct-${index}`}
              checked={question.correct_option === i}
              onChange={() => onChange({ ...question, correct_option: i })}
              aria-label={`Option ${i + 1} is correct`}
            />
            <TextField
              label={`Option ${i + 1}`}
              value={opt}
              onChange={(e) => setOption(i, e.target.value)}
              className="flex-1"
            />
            {options.length > MIN_OPTIONS && (
              <button
                type="button"
                onClick={() => removeOption(i)}
                aria-label={`Remove option ${i + 1}`}
                title="Remove option"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {options.length < MAX_OPTIONS && (
        <button type="button" onClick={addOption} className="w-fit text-caption text-primary hover:underline">
          + Add option
        </button>
      )}

      {confirmRemove && (
        <Modal
          onClose={() => setConfirmRemove(false)}
          title="Remove Question"
          widthRem={24}
          footer={
            <div className="flex justify-end gap-sm">
              <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmRemove(false)
                  onRemove()
                }}
              >
                Remove
              </Button>
            </div>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Remove <span className="font-medium text-text-primary">Question {index + 1}</span>? This can't be undone.
          </p>
        </Modal>
      )}
    </div>
  )
}

// User-requested (2026-08-15) — "we can also add prizes for different positions (not mandatory,
// some times only sentpo points)." Each row is independently optional in every field except the
// position number itself — a position can carry a prize, bonus points, or both.
// Remove reworked (user-requested, 2026-08-18 — "remove button delete icon - confirm on
// deletion") from a plain unconfirmed text link into a Trash2 icon with a confirm popup, same
// pattern QuestionEditor's own Remove already uses.
export function PrizeEditor({
  prize,
  onChange,
  onRemove,
}: {
  prize: PositionPrize
  onChange: (p: PositionPrize) => void
  onRemove: () => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)

  return (
    <div className="flex items-end gap-sm">
      <TextField
        label="Position"
        type="number"
        value={prize.position}
        onChange={(e) => onChange({ ...prize, position: Number(e.target.value) })}
        className="max-w-[5rem]"
      />
      <TextField
        label="Prize"
        value={prize.prize ?? ''}
        onChange={(e) => onChange({ ...prize, prize: e.target.value })}
        className="flex-1"
      />
      <TextField
        label="Bonus points"
        type="number"
        value={prize.points ?? ''}
        onChange={(e) => onChange({ ...prize, points: e.target.value ? Number(e.target.value) : undefined })}
        className="max-w-[10rem]"
      />
      <button
        type="button"
        onClick={() => setConfirmRemove(true)}
        aria-label={`Remove position ${prize.position} prize`}
        title="Remove"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {confirmRemove && (
        <Modal
          onClose={() => setConfirmRemove(false)}
          title="Remove Position Prize"
          widthRem={24}
          footer={
            <div className="flex justify-end gap-sm">
              <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmRemove(false)
                  onRemove()
                }}
              >
                Remove
              </Button>
            </div>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Remove the prize for <span className="font-medium text-text-primary">position {prize.position}</span>? This
            can't be undone.
          </p>
        </Modal>
      )}
    </div>
  )
}

// Split out of QuizAdminPage.tsx (Phase 3 plan, Tier B3, 2026-09-03) — pure movement unless noted.
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { useUpdateEvent } from '@/queries/eventsAdmin'
import { type Event, type QuizQuestionInput, MIN_OPTIONS, emptyQuestion, isQuestionValid } from './quizShared'
import { QuestionEditor } from './QuizQuestionEditor'

// Step 2 of quiz creation, and also reachable any time afterward to keep growing the pool
// (user-requested — "then next stage questions can be added"). Saves via PATCH, replacing the
// whole pool each time (same idiom as StepTemplateInput). Stays open after Save so more questions
// can be added in the same sitting; "Done" closes it.
// Reworked (user-requested, 2026-08-16 — "can we have separate pages for each question, with
// option to add more") from a single stacked list of every question into one question per "page":
// a numbered pager (also usable to jump straight to any question) plus Previous/Next, with a `+`
// pager button that appends a new empty question and jumps straight to it. Keeps a large pool
// readable instead of scrolling through every question at once.
export function ManageQuestionsModal({ event, onClose }: { event: Event; onClose: () => void }) {
  const updateEvent = useUpdateEvent(event.id!)
  const [questions, setQuestions] = useState<QuizQuestionInput[]>(
    event.questions && event.questions.length > 0 ? event.questions : [emptyQuestion()],
  )
  const [currentIndex, setCurrentIndex] = useState(0)

  function updateQuestion(i: number, q: QuizQuestionInput) {
    setQuestions((prev) => prev.map((existing, idx) => (idx === i ? q : existing)))
  }

  function addQuestion() {
    setQuestions((prev) => {
      const next = [...prev, emptyQuestion()]
      setCurrentIndex(next.length - 1)
      return next
    })
  }

  function removeQuestion(i: number) {
    setQuestions((prev) => {
      const next = prev.filter((_, idx) => idx !== i)
      setCurrentIndex((ci) => Math.min(ci, Math.max(next.length - 1, 0)))
      return next
    })
  }

  const needed = event.questions_per_attempt ?? 0
  const wouldBeActive = !event.voided && questions.length >= needed
  const current = questions[currentIndex] as QuizQuestionInput | undefined
  const allValid = questions.every(isQuestionValid)

  return (
    <Modal
      onClose={onClose}
      title={`${event.title} — Manage Questions`}
      widthRem={50}
      footer={
        <>
          {!allValid && (
            <p className="mr-auto self-center text-body-sm text-error">
              Every question needs text and at least {MIN_OPTIONS} filled-in options before saving — look for the red
              dot on its page number above.
            </p>
          )}
          {updateEvent.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updateEvent.error.message}</p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
          <Button
            loading={updateEvent.isPending}
            disabled={!allValid}
            onClick={() => updateEvent.mutate({ questions })}
          >
            Save Questions
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className={`text-body-sm ${wouldBeActive ? 'text-success' : 'text-text-secondary'}`}>
          Pool: {questions.length} / {needed} needed to activate
          {wouldBeActive ? ' — ready.' : '.'}
        </p>

        <div className="flex flex-wrap items-center gap-xs">
          {questions.map((q, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrentIndex(i)}
              aria-label={`Go to question ${i + 1}${isQuestionValid(q) ? '' : ' (incomplete)'}`}
              aria-current={i === currentIndex}
              className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-caption font-medium transition-colors ${
                i === currentIndex ? 'bg-primary text-white' : 'bg-background text-text-secondary hover:bg-border'
              }`}
            >
              {i + 1}
              {!isQuestionValid(q) && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-error" aria-hidden="true" />
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={addQuestion}
            aria-label="Add question"
            title="Add question"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-text-secondary hover:bg-border hover:text-primary"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {current ? (
          <QuestionEditor
            key={currentIndex}
            question={current}
            index={currentIndex}
            onChange={(nq) => updateQuestion(currentIndex, nq)}
            onRemove={() => removeQuestion(currentIndex)}
          />
        ) : (
          <p className="text-body-sm text-text-secondary">No questions yet — add one to get started.</p>
        )}

        <div className="flex items-center justify-between border-t border-border pt-sm">
          <div className="flex gap-xs">
            <Button
              variant="secondary"
              size="sm"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => i - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={currentIndex >= questions.length - 1}
              onClick={() => setCurrentIndex((i) => i + 1)}
            >
              Next
            </Button>
          </div>
          <span className="text-caption text-text-secondary">
            {questions.length === 0 ? 'No questions' : `Question ${currentIndex + 1} of ${questions.length}`}
          </span>
        </div>
      </div>
    </Modal>
  )
}

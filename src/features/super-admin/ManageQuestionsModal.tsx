// Split out of QuizAdminPage.tsx (Phase 3 plan, Tier B3, 2026-09-03) — pure movement unless noted.
import { useMemo, useState } from 'react'
import { Copy, Plus } from 'lucide-react'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { SelectField } from '@/components/SelectField'
import { useAdminEvents, useUpdateEvent } from '@/queries/eventsAdmin'
import { type Event, type QuizQuestionInput, MIN_OPTIONS, emptyQuestion, isQuestionValid } from './quizShared'
import { QuestionEditor } from './QuizQuestionEditor'

// "Reuse questions from another quiz" (product review, 2026-09-12) — a new quiz's pool used to
// always start from a blank question, even when it was really a rerun of one already built.
// Client-side only: picked questions are copied into this quiz's pool with their id dropped (they
// become new questions here, editable independently of the source), same as the empty-question row
// this modal already appends. No server change — GET /events?type=quiz already returns each
// admin-visible quiz's `questions` in full, correct answers included.
function ReuseQuestionsModal({
  currentEventId,
  onClose,
  onAdd,
}: {
  currentEventId: string
  onClose: () => void
  onAdd: (questions: QuizQuestionInput[]) => void
}) {
  const quizzes = useAdminEvents({ type: 'quiz', limit: 100 })
  const sourceOptions = useMemo(
    () => (quizzes.data?.items ?? []).filter((e) => e.id !== currentEventId && (e.questions?.length ?? 0) > 0),
    [quizzes.data, currentEventId],
  )
  const [sourceId, setSourceId] = useState('')
  const source = sourceOptions.find((e) => e.id === sourceId)
  const [checked, setChecked] = useState<Set<number>>(new Set())

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function pickSource(id: string) {
    setSourceId(id)
    setChecked(new Set())
  }

  return (
    <Modal
      onClose={onClose}
      title="Reuse questions from another quiz"
      widthRem={36}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={checked.size === 0}
            onClick={() => {
              const picked = (source?.questions ?? [])
                .filter((_, i) => checked.has(i))
                .map((q): QuizQuestionInput => ({ text: q.text, options: [...q.options], correct_option: q.correct_option }))
              onAdd(picked)
              onClose()
            }}
          >
            Add {checked.size > 0 ? `${checked.size} ` : ''}question{checked.size === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <SelectField
          label="Quiz"
          id="reuse-source-quiz"
          value={sourceId}
          onChange={(e) => pickSource(e.target.value)}
        >
          <option value="">Choose a quiz…</option>
          {sourceOptions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} ({e.questions?.length ?? 0} question{(e.questions?.length ?? 0) === 1 ? '' : 's'})
            </option>
          ))}
        </SelectField>

        {quizzes.isLoading && <p className="text-body-sm text-text-secondary">Loading quizzes…</p>}
        {!quizzes.isLoading && sourceOptions.length === 0 && (
          <p className="text-body-sm text-text-secondary">No other quiz has questions yet.</p>
        )}

        {source && (
          <div className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
            {(source.questions ?? []).map((q, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-sm px-md py-sm text-body-sm hover:bg-background">
                <input
                  type="checkbox"
                  className="mt-xs"
                  checked={checked.has(i)}
                  onChange={() => toggle(i)}
                  aria-label={q.text || `Question ${i + 1}`}
                />
                <span className="min-w-0">
                  <span className="block text-text-primary">{q.text}</span>
                  <span className="block text-caption text-text-secondary">{q.options.length} options</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

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
  const [reusing, setReusing] = useState(false)

  function addReusedQuestions(picked: QuizQuestionInput[]) {
    if (picked.length === 0) return
    setQuestions((prev) => {
      const next = [...prev, ...picked]
      setCurrentIndex(next.length - picked.length)
      return next
    })
  }

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
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <p className={`text-body-sm ${wouldBeActive ? 'text-success' : 'text-text-secondary'}`}>
            Pool: {questions.length} / {needed} needed to activate
            {wouldBeActive ? ' — ready.' : '.'}
          </p>
          <Button variant="secondary" size="sm" onClick={() => setReusing(true)}>
            <Copy className="mr-xs h-3.5 w-3.5" aria-hidden />
            Reuse from another quiz
          </Button>
        </div>

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

      {reusing && (
        <ReuseQuestionsModal
          currentEventId={event.id!}
          onClose={() => setReusing(false)}
          onAdd={addReusedQuestions}
        />
      )}
    </Modal>
  )
}

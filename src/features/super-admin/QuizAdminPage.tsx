import { useMemo, useState, type FormEvent } from 'react'
import { Ban, Image, ListChecks, Plus, Trash2, Trophy, X } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { FieldLabel } from '@/components/FieldLabel'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import { ImageUploadField } from '@/components/ImageUploadField'
import { useAdminEvents, useCreateEvent, useUpdateEvent, useVoidEvent, useQuizLeaderboard } from '@/queries/eventsAdmin'
import { formatDateTime, formatEventDateTime, formatDuration } from '@/lib/time'
import { EVENT_TIMEZONES, browserTimezone, utcIsoToWallClock, wallClockToUtcIso } from '@/lib/eventTimezones'
import type { components } from '@/api/schema'
import { SelectField } from '@/components/SelectField'
import { TargetingFilter } from '@/components/TargetingFilter'
import { hasAnyTargeting, type Targeting } from '@/lib/targeting'
import { useCountries } from '@/queries/countries'

type Event = components['schemas']['Event']
type QuizQuestionInput = components['schemas']['QuizQuestionInput']
type PositionPrize = components['schemas']['PositionPrize']
type QuizLeaderboardEntry = components['schemas']['QuizLeaderboardEntry']

const typeBadgeColor: Record<'applicant' | 'aspirant', 'success' | 'info'> = {
  applicant: 'success',
  aspirant: 'info',
}

const MIN_OPTIONS = 4
const MAX_OPTIONS = 6

function emptyQuestion(): QuizQuestionInput {
  return { text: '', options: ['', '', '', ''], correct_option: 0 }
}

function emptyPrize(position: number): PositionPrize {
  return { position, prize: '', points: undefined }
}

// A question can only be saved once it has text and at least MIN_OPTIONS options with real
// values (user-requested, 2026-08-16 — "to save a new question, there should be atleast value in
// question field and min 4 options"). Matches openapi.yaml's QuizQuestionInput.options
// minItems: 4/maxItems: 6, which was already the documented contract — this just enforces it in
// the editor instead of letting an incomplete question reach the PATCH call.
function isQuestionValid(q: QuizQuestionInput): boolean {
  const filled = (q.options ?? []).filter((o) => o.trim() !== '').length
  return q.text.trim() !== '' && filled >= MIN_OPTIONS
}

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
function QuestionEditor({
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
function PrizeEditor({
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

// User-requested (2026-08-15) — "lets do that in 2 steps.. first create the quiz.. title, start
// time, end time... Questions per attempt, Time limit... quiz will be inactive till questions
// (min => Questions per attempt)." Step 1 collects settings only, no questions — the quiz saves
// inactive with an empty pool; Step 2 (ManageQuestionsModal below) is where the pool gets built
// up until it reaches questions_per_attempt, at which point the quiz activates on its own
// (Event.active is computed server-side, never a manual toggle).
// Reworked into a combined Create/Edit modal (user-requested, 2026-08-17 — "We need description
// for the quiz competition. We need a popup to see all details and edit these details as well")
// — same `editingEvent`-prop pattern Webinar/Physical Meeting's forms already use, plus a new
// Description field (the schema always had it generically, just was never collected here, same
// class of gap as Webinar/Physical Meeting's description before this session). Unlike Webinar/
// Physical Meeting, this is the ONE popup for both viewing and editing rather than a split
// read-only-details-popup-plus-separate-edit-icon — Quiz has no other "read-only summary" content
// to show (participation/leaderboard already has its own dedicated popup via
// QuizParticipationCell), so every field the details popup would show is already directly
// editable here; splitting them would just mean two nearly-identical popups showing the same
// fields, one of them permanently read-only for no reason. Triggered by clicking the quiz title,
// same click-title-for-details convention as Webinar/Physical Meeting use, just editable here.
function QuizSettingsModal({
  editingEvent,
  onClose,
  onCreated,
}: {
  editingEvent?: Event
  onClose: () => void
  onCreated?: (eventId: string) => void
}) {
  const isEditing = Boolean(editingEvent)
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent(editingEvent?.id ?? '')
  const [title, setTitle] = useState(editingEvent?.title ?? '')
  const [description, setDescription] = useState(editingEvent?.description ?? '')
  // The zone the admin is TYPING IN (2026-08-23). A quiz has no venue, so unlike a physical
  // meeting nothing is local to a place — the window converts to each student's own clock, which
  // is correct. What was missing is the same thing webinars were missing: the admin had no way to
  // see which clock they were entering the window in, so an admin abroad opening an India quiz
  // could not check their own work.
  const [timezone, setTimezone] = useState(editingEvent?.timezone ?? browserTimezone())
  const [startsAt, setStartsAt] = useState(
    editingEvent?.starts_at
      ? utcIsoToWallClock(editingEvent.starts_at, editingEvent.timezone ?? browserTimezone())
      : '',
  )
  const [endsAt, setEndsAt] = useState(
    editingEvent?.ends_at ? utcIsoToWallClock(editingEvent.ends_at, editingEvent.timezone ?? browserTimezone()) : '',
  )
  const [questionsPerAttempt, setQuestionsPerAttempt] = useState(editingEvent?.questions_per_attempt ?? 5)
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(editingEvent?.time_limit_minutes ?? 15)
  const [participationPoints, setParticipationPoints] = useState(editingEvent?.points_override ?? 10)
  const [prizes, setPrizes] = useState<PositionPrize[]>(editingEvent?.position_prizes ?? [])
  // Quizzes have supported targeting in the data model all along, but the console never exposed
  // it — so every quiz reached every student regardless of what the schema allowed.
  const [targeting, setTargeting] = useState<Targeting>(editingEvent?.targeting ?? {})
  const countries = useCountries()

  const mutation = isEditing ? updateEvent : createEvent

  function updatePrize(i: number, p: PositionPrize) {
    setPrizes((prev) => prev.map((existing, idx) => (idx === i ? p : existing)))
  }

  function removePrize(i: number) {
    setPrizes((prev) => prev.filter((_, idx) => idx !== i))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title || !startsAt) return
    const body = {
      title,
      description: description || null,
      starts_at: wallClockToUtcIso(startsAt, timezone),
      ends_at: endsAt ? wallClockToUtcIso(endsAt, timezone) : undefined,
      timezone,
      questions_per_attempt: questionsPerAttempt,
      time_limit_minutes: timeLimitMinutes,
      points_override: participationPoints,
      position_prizes: prizes,
      targeting: hasAnyTargeting(targeting) ? targeting : null,
    }
    if (isEditing) {
      updateEvent.mutate(body, { onSuccess: () => onClose() })
    } else {
      createEvent.mutate(
        { type: 'quiz', ...body, questions: [] },
        { onSuccess: (event) => event?.id && onCreated?.(event.id) },
      )
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={editingEvent ? `${editingEvent.title} — Quiz Details` : 'Create Quiz — Step 1 of 2: Settings'}
      widthRem={50}
      footer={
        <>
          {mutation.isError && <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>}
          <Button type="submit" form="quiz-settings-form" loading={mutation.isPending} disabled={!title || !startsAt}>
            {isEditing ? 'Save Changes' : 'Next: Add Questions'}
          </Button>
        </>
      }
    >
      <form id="quiz-settings-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex flex-col gap-xs">
          <FieldLabel htmlFor="quiz-description">Description</FieldLabel>
          <textarea
            id="quiz-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded-md border border-border bg-surface p-sm text-body text-text-primary"
          />
        </div>
        <div className="grid grid-cols-2 gap-sm">
          <TextField
            label="Starts at"
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <TextField label="Ends at" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
        <SelectField label="Time zone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {(EVENT_TIMEZONES as readonly string[]).includes(timezone) ? null : (
            <option value={timezone}>{timezone}</option>
          )}
          {EVENT_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-col gap-sm rounded-md border border-border bg-background p-sm">
          <FieldLabel htmlFor="quiz-targeting">Who can see this quiz</FieldLabel>
          <TargetingFilter
            value={targeting}
            onChange={setTargeting}
            countries={countries.data ?? []}
            unknownDataPolicy="includes"
          />
        </div>
        <p className="mt-1 text-caption text-text-secondary">
          The zone you are entering this window in. Students see it on their own clock — a quiz has no venue, so nothing
          here is shown unconverted.
        </p>
        <p className="-mt-sm text-caption text-text-secondary">
          The quiz can only be started while this window is open.
        </p>
        <div className="grid grid-cols-3 gap-sm">
          <TextField
            label="Questions per attempt"
            type="number"
            value={questionsPerAttempt}
            onChange={(e) => setQuestionsPerAttempt(Number(e.target.value))}
          />
          <TextField
            label="Time limit (minutes)"
            type="number"
            value={timeLimitMinutes}
            onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
          />
          <TextField
            label="Participation points"
            type="number"
            value={participationPoints}
            onChange={(e) => setParticipationPoints(Number(e.target.value))}
          />
        </div>
        <p className="-mt-sm text-caption text-text-secondary">
          Participation points are awarded to everyone who completes the quiz, regardless of leaderboard position.
        </p>

        <div className="flex flex-col gap-sm">
          <p className="text-body-sm font-medium text-text-primary">Position prizes</p>
          <p className="text-caption text-text-secondary">
            Add a prize, bonus points, or both for specific leaderboard positions. Leave empty if this quiz is
            participation-points-only.
          </p>
          {prizes.map((p, i) => (
            <PrizeEditor key={i} prize={p} onChange={(np) => updatePrize(i, np)} onRemove={() => removePrize(i)} />
          ))}
          <button
            type="button"
            onClick={() => setPrizes((prev) => [...prev, emptyPrize(prev.length + 1)])}
            className="w-fit text-caption text-primary hover:underline"
          >
            + Add position prize
          </button>
        </div>

        {!isEditing && (
          <p className="text-caption text-text-secondary">
            The quiz saves as <strong>inactive</strong> — you'll add its question pool next. It activates on its own
            once the pool reaches {questionsPerAttempt} question
            {questionsPerAttempt === 1 ? '' : 's'}.
          </p>
        )}
      </form>
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
function ManageQuestionsModal({ event, onClose }: { event: Event; onClose: () => void }) {
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

// Row-level component so useVoidEvent() can be called at its own render top level — Table's
// `render: (row) => ...` runs as a callback, not a component body. User-requested (2026-08-15) —
// "Void quiz need confirmation," was firing directly off one click.
function VoidQuizAction({ event }: { event: Event }) {
  const voidEvent = useVoidEvent()
  const [confirming, setConfirming] = useState(false)

  if (event.voided) return null

  return (
    <div>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Void ${event.title}`}
        title="Void Quiz"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
      >
        <Ban className="h-4 w-4" />
      </button>
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Void Quiz"
          widthRem={24}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={voidEvent.isPending}
                onClick={() => voidEvent.mutate(event.id!, { onSuccess: () => setConfirming(false) })}
              >
                Void
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Void <span className="font-medium text-text-primary">{event.title}</span>? This reverses any points already
            awarded for it and can't be undone.
          </p>
        </Modal>
      )}
    </div>
  )
}

const LEADERBOARD_PAGE_SIZE = 25

// User-requested (2026-08-17) — "where do I see how many people participated and their details
// as well as leader board" had no answer anywhere in the admin console before this. Built on the
// shared Table primitive (search/sort/pagination for free) rather than a bespoke list, same
// scale reasoning as PersonListModal's search+pagination follow-up — a popular quiz could have
// hundreds of attempts. `bare` (same-day follow-up — "do not put it inside card") drops Table's
// own card chrome since it's already nested inside Modal's; Contact number (same follow-up —
// "can we have contact number also") is included in the search filter alongside name/email.
function QuizLeaderboardModal({ event, onClose }: { event: Event; onClose: () => void }) {
  const leaderboard = useQuizLeaderboard(event.id)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>({
    field: 'rank',
    direction: 'asc',
  })
  const [page, setPage] = useState(0)

  const rows = useMemo(() => {
    let items = leaderboard.data?.entries ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (r) =>
          r.student_name.toLowerCase().includes(q) ||
          (r.email ?? '').toLowerCase().includes(q) ||
          (r.phone ?? '').includes(q),
      )
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av =
          sort.field === 'score' ? a.score : sort.field === 'completion_time_ms' ? a.completion_time_ms : a.rank
        const bv =
          sort.field === 'score' ? b.score : sort.field === 'completion_time_ms' ? b.completion_time_ms : b.rank
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [leaderboard.data, search, sort])

  const pageRows = rows.slice(page * LEADERBOARD_PAGE_SIZE, page * LEADERBOARD_PAGE_SIZE + LEADERBOARD_PAGE_SIZE)

  const columns: TableColumn<QuizLeaderboardEntry>[] = [
    { key: 'rank', header: '#', sortable: true, align: 'right', render: (r) => r.rank },
    { key: 'student_name', header: 'Name', sortable: true, render: (r) => r.student_name },
    // email/phone/student_type became Platform-Admin-only in the API on 2026-08-18 (the student
    // app hits this same endpoint and was receiving every classmate's contact details). This
    // console is admin-only so they are always populated here, but they are optional in the
    // contract now and `strictNullChecks` is off in this project — so guard rather than trust.
    { key: 'email', header: 'Email', render: (r) => r.email ?? '—' },
    { key: 'phone', header: 'Contact number', render: (r) => r.phone ?? '—' },
    {
      key: 'student_type',
      header: 'Type',
      render: (r) =>
        r.student_type ? (
          <Badge color={typeBadgeColor[r.student_type]} className="capitalize">
            {r.student_type}
          </Badge>
        ) : (
          '—'
        ),
    },
    {
      key: 'score',
      header: 'Score',
      sortable: true,
      align: 'right',
      render: (r) => `${r.score} / ${event.questions_per_attempt}`,
    },
    {
      key: 'completion_time_ms',
      header: 'Time',
      sortable: true,
      align: 'right',
      render: (r) => formatDuration(r.completion_time_ms),
    },
  ]

  return (
    <Modal onClose={onClose} title={`${event.title} — Leaderboard`} widthRem={54}>
      <Table
        bare
        columns={columns}
        rows={pageRows}
        rowKey={(r) => `${r.rank}-${r.student_name}`}
        loading={leaderboard.isLoading}
        error={leaderboard.isError ? 'Could not load the leaderboard.' : undefined}
        emptyMessage="No completed attempts yet."
        sort={sort}
        onSortChange={(field, direction) => {
          setSort({ field, direction })
          setPage(0)
        }}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value)
            setPage(0)
          },
          placeholder: 'Search name or email…',
        }}
        pagination={{
          hasNext: (page + 1) * LEADERBOARD_PAGE_SIZE < rows.length,
          hasPrevious: page > 0,
          onNext: () => setPage((p) => p + 1),
          onPrevious: () => setPage((p) => Math.max(0, p - 1)),
          total: rows.length,
        }}
      />
    </Modal>
  )
}

// Row-level component so the click-to-open state lives at its own render top level, same reasoning
// as VoidQuizAction above. The count itself is a link-styled button, not a Table cell rendering a
// plain number — clicking it opens QuizLeaderboardModal.
function QuizParticipationCell({ event }: { event: Event }) {
  const [showLeaderboard, setShowLeaderboard] = useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowLeaderboard(true)}
        className="inline-flex items-center gap-xs text-body-sm text-primary hover:underline"
      >
        <Trophy className="h-4 w-4" />
        {event.attendance_count ?? 0} participated
      </button>
      {showLeaderboard && <QuizLeaderboardModal event={event} onClose={() => setShowLeaderboard(false)} />}
    </div>
  )
}

// User-requested (2026-08-18) — "No quiz needs ad options too... do not include in the existing
// popup." Build reference 1.13's "three configurable branding placements" (pre-load screen,
// persistent banner during questions, results screen) have existed in the schema/seed data since
// Wave 5b but were never exposed in any admin UI (flagged as a known gap in PROGRESS.md). Built
// here as its own popup, deliberately kept out of the already-large Quiz Details settings modal
// per the explicit ask, reachable via its own icon on the Quiz list row (same pattern as Manage
// Questions/Void) — distinct from the Ads Manager's home-screen carousel, which can already
// link out to a specific quiz via its existing destination_type: 'event' picker; this is sponsor
// creative shown *inside* the quiz-taking flow itself, not a separate app-wide banner.
// Fields upgraded from typed-in "image URL" text boxes to real ImageUploadField pickers same day
// (user: "We should be able to upload the image. No point just giving image name.. these are not
// mandatory images") — each placement stays independently optional, with a Remove (X) affordance
// once one is set. Ideal-size hints added the same day for Pre-load screen (320×250px) and
// In-quiz banner (320×50px) per the user's own numbers; Results screen has none since none were
// given.
function QuizBrandingModal({ event, onClose }: { event: Event; onClose: () => void }) {
  const updateEvent = useUpdateEvent(event.id!)
  const branding = (event.branding ?? {}) as Record<string, unknown>
  const [preloadScreen, setPreloadScreen] = useState(
    typeof branding.preload_screen === 'string' ? branding.preload_screen : '',
  )
  const [inQuizBanner, setInQuizBanner] = useState(
    typeof branding.in_quiz_banner === 'string' ? branding.in_quiz_banner : '',
  )
  const [resultsScreen, setResultsScreen] = useState(
    typeof branding.results_screen === 'string' ? branding.results_screen : '',
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // Blank placements are OMITTED, never written as null. `branding` is a free-form jsonb map,
    // which openapi-generator types as `Map<String, Object>` in Dart — non-nullable *values* — so a
    // single null inside it makes the whole event response unparseable and takes the student's
    // Events tab down with it. That exact defect shipped once already (Session 32); the mock
    // server strips nulls defensively on the way out, but writing them here would put them
    // straight back the moment a real backend serves what it was given.
    const branding = Object.fromEntries(
      Object.entries({
        preload_screen: preloadScreen,
        in_quiz_banner: inQuizBanner,
        results_screen: resultsScreen,
      }).filter(([, value]) => Boolean(value)),
    )
    updateEvent.mutate({ branding }, { onSuccess: () => onClose() })
  }

  return (
    <Modal
      onClose={onClose}
      title={`${event.title} — Branding`}
      widthRem={32}
      footer={
        <Button type="submit" form="quiz-branding-form" loading={updateEvent.isPending}>
          Save
        </Button>
      }
    >
      <form id="quiz-branding-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          Sponsor creative shown during the quiz-taking flow itself, distinct from the Ads Manager's home-screen
          carousel.
        </p>
        <p className="text-caption text-text-secondary">
          Each placement is independent and none is required — leave one blank and the app simply skips it. There is no
          fallback creative.
        </p>
        <ImageUploadField
          label="Pre-load screen image"
          value={preloadScreen}
          onChange={setPreloadScreen}
          hint="Portrait card shown before the quiz starts. Ideal size 320×250px."
        />
        <ImageUploadField
          label="In-quiz banner image"
          value={inQuizBanner}
          onChange={setInQuizBanner}
          hint="Thin strip above the question. Ideal size 320×50px."
        />
        <ImageUploadField
          label="Results screen image"
          value={resultsScreen}
          onChange={setResultsScreen}
          hint="Shown with the student's score. Ideal size 320×250px."
        />
      </form>
    </Modal>
  )
}

export function QuizAdminPage() {
  const events = useAdminEvents('quiz')
  const [showAdd, setShowAdd] = useState(false)
  const [managingId, setManagingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [brandingId, setBrandingId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    let items = events.data?.items ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((e) => e.title?.toLowerCase().includes(q))
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av =
          sort.field === 'attendance_count'
            ? (a.attendance_count ?? 0)
            : sort.field === 'starts_at'
              ? (a.starts_at ?? '')
              : (a.title ?? '').toLowerCase()
        const bv =
          sort.field === 'attendance_count'
            ? (b.attendance_count ?? 0)
            : sort.field === 'starts_at'
              ? (b.starts_at ?? '')
              : (b.title ?? '').toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [events.data, search, sort])

  const managingEvent = managingId ? rows.find((e) => e.id === managingId) : undefined
  const editingEvent = editingId ? rows.find((e) => e.id === editingId) : undefined
  const brandingEvent = brandingId ? rows.find((e) => e.id === brandingId) : undefined

  // Pool-count/per-attempt pills removed from the title (user-requested, 2026-08-17 — "avoid
  // showing question pool count and count per attempt in pill... we will need a popup to see all
  // the details anyway") — Manage Questions already shows the live pool count, and cramming both
  // numbers into the row as pills added noise without adding anything the popup doesn't already
  // say better. Ends column added in their place; the participant count is now a clickable link
  // opening the new leaderboard popup instead of a bare number.
  const columns: TableColumn<Event>[] = [
    {
      key: 'title',
      header: 'Quiz',
      sortable: true,
      render: (e) => (
        <div className="flex items-center gap-sm">
          <button
            type="button"
            onClick={() => setEditingId(e.id!)}
            className="text-left font-medium text-text-primary hover:text-primary hover:underline"
          >
            {e.title}
          </button>
          {e.voided && <Badge color="error">Voided</Badge>}
          {!e.voided && <Badge color={e.active ? 'success' : 'secondary'}>{e.active ? 'Active' : 'Inactive'}</Badge>}
        </div>
      ),
    },
    { key: 'starts_at', header: 'Starts', sortable: true, render: (e) => formatEventDateTime(e) },
    { key: 'ends_at', header: 'Ends', render: (e) => (e.ends_at ? formatDateTime(e.ends_at) : '—') },
    {
      key: 'attendance_count',
      header: 'Participation',
      sortable: true,
      align: 'right',
      render: (e) => <QuizParticipationCell event={e} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) => (
        <div className="flex justify-end gap-xs">
          <button
            type="button"
            onClick={() => setManagingId(e.id!)}
            aria-label={`Manage questions for ${e.title}`}
            title="Manage Questions"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <ListChecks className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setBrandingId(e.id!)}
            aria-label={`Manage branding for ${e.title}`}
            title="Branding"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Image className="h-4 w-4" />
          </button>
          <VoidQuizAction event={e} />
        </div>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Quiz</h1>
            <p className="text-body-sm text-text-secondary">Points-earning quizzes drawn from a question pool.</p>
          </div>
          <Button onClick={() => setShowAdd(true)}>Add Quiz</Button>
        </div>

        {showAdd && (
          <QuizSettingsModal
            onClose={() => setShowAdd(false)}
            onCreated={(eventId) => {
              setShowAdd(false)
              setManagingId(eventId)
            }}
          />
        )}
        {editingEvent && <QuizSettingsModal editingEvent={editingEvent} onClose={() => setEditingId(null)} />}
        {managingEvent && <ManageQuestionsModal event={managingEvent} onClose={() => setManagingId(null)} />}
        {brandingEvent && <QuizBrandingModal event={brandingEvent} onClose={() => setBrandingId(null)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id!}
          loading={events.isLoading}
          emptyMessage="No quizzes yet."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search title…' }}
        />
      </div>
    </AdminShell>
  )
}

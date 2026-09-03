// Split out of QuizAdminPage.tsx (Phase 3 plan, Tier B3, 2026-09-03) — pure movement unless noted.
// The create/edit form's state moved into useQuizForm.ts; the JSX is unchanged.
import { type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { FieldLabel } from '@/components/FieldLabel'
import { Modal } from '@/components/Modal'
import { useCreateEvent, useUpdateEvent } from '@/queries/eventsAdmin'
import { EVENT_TIMEZONES } from '@/lib/eventTimezones'
import { SelectField } from '@/components/SelectField'
import { TargetingFilter } from '@/features/super-admin/TargetingFilter'
import { useCountries } from '@/queries/countries'
import { type Event } from './quizShared'
import { PrizeEditor } from './QuizQuestionEditor'
import { useQuizForm } from './useQuizForm'

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
export function QuizSettingsModal({
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
  // Form state lives in useQuizForm (Tier B3, 2026-09-03), the treatment CourseFormModal got
  // with useCourseForm: this modal keeps the query hooks and the mutate() call; the hook owns
  // every field, the prize list operations, validity and the payload builder.
  const {
    title, setTitle, description, setDescription, timezone, setTimezone, startsAt, setStartsAt,
    endsAt, setEndsAt, questionsPerAttempt, setQuestionsPerAttempt, timeLimitMinutes, setTimeLimitMinutes,
    participationPoints, setParticipationPoints, prizes, updatePrize, removePrize, addPrize,
    targeting, setTargeting, isValid, toPayload,
  } = useQuizForm(editingEvent)
  const countries = useCountries()

  const mutation = isEditing ? updateEvent : createEvent


  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isValid) return
    const body = toPayload()
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
          <Button type="submit" form="quiz-settings-form" loading={mutation.isPending} disabled={!isValid}>
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
        <p className="mt-xs text-caption text-text-secondary">
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
            onClick={addPrize}
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

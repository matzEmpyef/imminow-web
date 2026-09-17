import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { useSetIntakeDeadline } from '@/queries/courseSuggestions'
import { showToast } from '@/lib/toast'

/**
 * "Set Intake Deadline" (2026-09-17 spec, built 2026-09-18) — a consultancy staff member's own
 * pencil next to ONE intake's application deadline in Course Detail's Intake & Deadlines table.
 * Same small-pencil-opens-a-Modal shape as `SuggestCorrectionButton` right above it in this file's
 * neighbourhood, but a DIFFERENT verb: that button *proposes* a change for a Platform Admin to
 * review; this one *sets* the deadline directly, because a consultancy that has just talked to the
 * college is usually the one who actually knows it changed.
 *
 * `PATCH /courses/{id}/intake-deadlines` still keeps a human in the loop when it matters: if a
 * PERSON changed this same deadline within the last 15 days, the server queues an ordinary
 * `CourseSuggestion` instead of applying the edit (`applied: false`, 202) — one consultancy
 * self-serving over another's days-old correction would be worse than the extra review step. A
 * fresh, untouched deadline (or one nobody has touched in over two weeks) applies immediately
 * (`applied: true`, 200). Either way the request looks identical from here; only the response
 * says which happened, so the two toasts below are this control's entire "was it applied" UI —
 * there is no separate confirmation screen.
 *
 * Only ever rendered when `CourseDetailModal` has already confirmed the entry exists (this PATCH
 * 404s for a month with no `IntakeDeadline` row at all, e.g. a course whose `intakes` list
 * outruns its deadline data) and the caller is consultancy staff (Platform Admins edit the course
 * itself in Course Setup instead).
 */
export function IntakeDeadlineEditor({
  courseId,
  month,
  currentDeadline,
  currentStatus,
  onApplied,
}: {
  courseId: string
  month: string
  // Null is a real, meaningful value here (rolling admission), not "unknown" — unlike
  // SuggestCorrectionButton's `current`, which uses null for "no value yet".
  currentDeadline: string | null
  currentStatus?: 'open' | 'closed'
  // Fires only on the applied=true path, with exactly what was just written, so the table can
  // show it without waiting on a refetch of the whole course (CourseDetailModal is handed a
  // frozen `course` prop snapshot, not a live query result).
  onApplied: (next: { application_deadline: string | null; status?: 'open' | 'closed' }) => void
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(currentDeadline ?? '')
  const [status, setStatus] = useState<'open' | 'closed'>(currentStatus ?? 'open')
  const setDeadline = useSetIntakeDeadline(courseId)

  function openEditor() {
    // Reset to the current value each time it opens, in case an earlier open/cancel left stale
    // text in the field.
    setDate(currentDeadline ?? '')
    setStatus(currentStatus ?? 'open')
    setOpen(true)
  }

  function handleSave() {
    setDeadline.mutate(
      { month, application_deadline: date || null, status },
      {
        onSuccess: (result) => {
          if (result?.applied) {
            showToast('Deadline updated')
            onApplied({ application_deadline: date || null, status })
          } else {
            // Deliberately NOT the success tone — nothing changed on the catalogue yet. And NOT
            // the error tone either — nothing went wrong, the request just needs a person to
            // confirm it (the 15-day rule: this exact deadline was already touched recently).
            showToast(
              `Sent to immiNow for approval — the ${month} deadline was changed within the last 15 days, so it needs a second confirmation before it applies.`,
              'info',
            )
          }
          setOpen(false)
        },
      },
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          openEditor()
        }}
        aria-label={`Set the ${month} application deadline`}
        title="Set deadline"
        className="ml-xs inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-text-secondary opacity-40 transition-opacity hover:text-primary hover:opacity-100 group-hover:opacity-100"
      >
        <Pencil className="h-3 w-3" />
      </button>
      {open && (
        <Modal
          onClose={() => setOpen(false)}
          title={`Set deadline — ${month} intake`}
          widthRem={24}
          footer={
            <div className="flex justify-end gap-sm">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button loading={setDeadline.isPending} onClick={handleSave}>
                Save
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-secondary">
              Leave the date blank for rolling admission (no fixed deadline).
            </p>
            <TextField label="Application deadline" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as 'open' | 'closed')}>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </SelectField>
            {setDeadline.isError && <p className="text-body-sm text-error">{setDeadline.error.message}</p>}
          </div>
        </Modal>
      )}
    </>
  )
}

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useSuggestCorrection } from '@/queries/courseSuggestions'

/**
 * "Suggest this is wrong" — a small pencil next to ONE specific fact about a course, not a
 * general edit affordance (user, 2026-08-23: "consultant should be able to click on any data
 * point and suggest that it should have been something else. don't make everything clickable —
 * think of something smart").
 *
 * Deliberately scoped to FACTUAL, VERIFIABLE, load-bearing values — fee, duration, an intake
 * deadline, an entry requirement's published threshold — not to free-text prose (description,
 * benefits) or to the course/college name. A wrong fee or deadline actively misleads a student;
 * "the description could be phrased better" is a different kind of feedback this button is not
 * for. The student's OWN score in a Grade Match rule is also never wrapped in this — that is
 * their data, not the college's, and there is nothing here to correct.
 *
 * Submits through the SAME `POST /courses/{id}/suggest-correction` the dedicated Course
 * Suggestions page already uses, with a payload shaped as one field rather than a whole-course
 * diff — `{field, label, current, suggested, note}` reads as a sentence on the review page's raw
 * JSON dump even though that page was not changed, instead of an opaque partial-course object.
 */
export function SuggestCorrectionButton({
  courseId,
  field,
  label,
  current,
  numeric,
}: {
  courseId: string
  field: string
  label: string
  current: string
  // Fee is the one field where the admin's review popup can apply the value with one click
  // (2026-08-24: "the super admin can update the field just by clicking OK... add, add with
  // modification"). That only works if what lands in `suggested` is a clean number — a formatted
  // string like "CAD 63,000/yr" could not be trusted to round-trip back into a real Money field,
  // so this narrows the input to digits for exactly that one case rather than leaving every
  // caller free-text and hoping the number survives.
  numeric?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [suggested, setSuggested] = useState('')
  const [note, setNote] = useState('')
  const suggest = useSuggestCorrection()

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        aria-label={`Suggest a correction for ${label}`}
        title="Suggest a correction"
        // Was `opacity-0` + `group-hover:opacity-100` only — invisible-until-hover, and the
        // hover reveal never fired (2026-08-24, user: "i am not able to do this"; confirmed live
        // — the click handler, modal, and submission all worked fine when clicked by reference,
        // but the button's opacity stayed pinned at 0 through real hover, a genuine cascade
        // anomaly under this project's Tailwind v4 `@config` JS-compat bridge — see the
        // maxWidth/spacing note in tailwind.config.ts for a prior instance of the same bridge
        // not behaving as its source suggests). Baseline opacity-40 makes the pencil findable
        // with zero reliance on any hover mechanism working at all; the plain `hover:opacity-100`
        // on the button itself (a bare pseudo-class, not the `:where(.group)` construct that
        // broke) is the one hover path guaranteed to work. `group-hover:opacity-100` stays as a
        // bonus for whichever browsers do apply it.
        className="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-text-secondary opacity-40 transition-opacity hover:text-primary hover:opacity-100 group-hover:opacity-100"
      >
        <Pencil className="h-3 w-3" />
      </button>
      {open && (
        <Modal
          onClose={() => setOpen(false)}
          title={`Suggest a correction — ${label}`}
          footer={
            <div className="flex justify-end gap-sm">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!suggested.trim()}
                loading={suggest.isPending}
                onClick={() =>
                  suggest.mutate(
                    {
                      courseId,
                      payload: { field, label, current, suggested: suggested.trim(), note: note.trim() || null },
                    },
                    { onSuccess: () => setOpen(false) },
                  )
                }
              >
                Submit
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-secondary">
              Currently shows <span className="font-medium text-text-primary">{current}</span>. A Platform Admin reviews
              this before it changes anything.
            </p>
            {/* No autoFocus — useDialogA11y already places initial focus inside the dialog on
                mount, same as every other modal in the app (jsx-a11y/no-autofocus). */}
            <TextField
              label={numeric ? 'Should be (number only, same currency)' : 'Should be'}
              type={numeric ? 'number' : 'text'}
              value={suggested}
              onChange={(e) => setSuggested(e.target.value)}
            />
            <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            {suggest.isError && <p className="text-body-sm text-error">{suggest.error.message}</p>}
          </div>
        </Modal>
      )}
    </>
  )
}

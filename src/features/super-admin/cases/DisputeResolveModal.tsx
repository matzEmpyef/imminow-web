import { useState } from 'react'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Modal } from '@/components/Modal'
import { DISPUTE_ACTIONS, useResolveDispute, type CaseDispute, type DisputeAction } from '@/queries/disputes'
import { showToast } from '@/lib/toast'
import { ApiError } from '@/api/errors'

/**
 * The one choice left on a dispute whose student's account was deleted while it was open (owner
 * ruling 3, 2026-10-07). The case is already closed, so closing the dispute ends the dispute and
 * nothing else; Finance corrects any money with its own tools.
 */
const CLOSE_ONLY_ACTION = {
  value: 'close',
  label: 'Close dispute',
  detail:
    'The student’s account was deleted, so the case is already closed. This ends the dispute and changes neither the case nor any commission.',
} as const

/**
 * The decision that ends a dispute (carried over from the pre-rebuild DisputesPage, 2026-09-09).
 *
 * ACCOUNT DELETED WITH THE DISPUTE OPEN: the server accepts only `close` then, and answers
 * `resume` or `reassign` with 409 `conflict` and a sentence saying so. `CaseDispute` does not say
 * which disputes these are, so the modal learns it from that refusal: it shows the server's
 * sentence and from then on offers only "Close dispute".
 */
export function DisputeResolveModal({
  dispute,
  onClose,
  onResolved,
}: {
  dispute: CaseDispute
  onClose: () => void
  onResolved: (updated: CaseDispute) => void
}) {
  const resolve = useResolveDispute()
  const [action, setAction] = useState<DisputeAction | ''>('')
  const [note, setNote] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [closeOnly, setCloseOnly] = useState(false)
  const choices = closeOnly ? [CLOSE_ONLY_ACTION] : DISPUTE_ACTIONS
  const canSubmit = action !== '' && Boolean(note.trim())
  const actionError = attempted && action === '' ? 'Choose what was decided.' : undefined
  const noteError = attempted && !note.trim() ? 'Required. Explain what was decided, and why.' : undefined

  function handleResolve() {
    if (!canSubmit) {
      setAttempted(true)
      return
    }
    resolve.mutate(
      { id: dispute.id, action: action as DisputeAction, resolutionNote: note.trim() },
      {
        onSuccess: (updated) => {
          showToast(`Dispute resolved for ${dispute.student_name ?? 'this case'}`)
          if (updated) onResolved(updated)
          onClose()
        },
        onError: (error) => {
          if (action !== 'close' && error instanceof ApiError && error.code === 'conflict') {
            setCloseOnly(true)
            setAction('close')
          }
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={`Resolve — ${dispute.student_name ?? 'case'}`}
      widthRem={32}
      footer={
        <>
          {resolve.isError && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {resolve.error.message}
            </p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={resolve.isPending} onClick={handleResolve}>
            {closeOnly ? 'Close dispute' : 'Resolve'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <div className="flex flex-col gap-sm">
          {choices.map((a) => (
            <Card
              key={a.value}
              onClick={() => setAction(a.value)}
              className={`cursor-pointer ${action === a.value ? 'ring-2 ring-primary' : ''}`}
            >
              <p className="text-body font-medium text-text-primary">{a.label}</p>
              <p className="text-caption text-text-secondary">{a.detail}</p>
            </Card>
          ))}
          {actionError && <p className="text-caption text-error">{actionError}</p>}
        </div>

        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="dispute-note">
            What was decided, and why
          </label>
          <textarea
            id="dispute-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Who you spoke to, what they said, what you decided."
            aria-invalid={Boolean(noteError)}
            className={`rounded-md border bg-surface px-3 py-sm text-body ${noteError ? 'border-error' : 'border-border'}`}
          />
          {/* Required by the server, not merely encouraged. Mediation happens off the platform,
              so this note is the only part of the decision the record ever gets — and this is the
              one decision here with real legal exposure. */}
          <p className={`text-caption ${noteError ? 'text-error' : 'text-text-secondary'}`}>
            {noteError ?? 'Required. The conversation happened off Sentpo; this is the only record of it.'}
          </p>
        </div>
      </div>
    </Modal>
  )
}

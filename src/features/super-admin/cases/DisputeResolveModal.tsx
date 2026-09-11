import { useState } from 'react'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Modal } from '@/components/Modal'
import { DISPUTE_ACTIONS, useResolveDispute, type CaseDispute, type DisputeAction } from '@/queries/disputes'
import { showToast } from '@/lib/toast'

/** Carried over unchanged from the pre-rebuild DisputesPage (2026-09-09) — this content was already good. */
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
  const canSubmit = action !== '' && Boolean(note.trim())

  return (
    <Modal
      onClose={onClose}
      title={`Resolve — ${dispute.student_name ?? 'case'}`}
      widthRem={32}
      footer={
        <>
          {resolve.isError && <p className="mr-auto self-center text-body-sm text-error">{resolve.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={resolve.isPending}
            disabled={!canSubmit}
            onClick={() =>
              canSubmit &&
              resolve.mutate(
                { id: dispute.id, action: action as DisputeAction, resolutionNote: note.trim() },
                {
                  onSuccess: (updated) => {
                    showToast(`Dispute resolved for ${dispute.student_name ?? 'this case'}`)
                    if (updated) onResolved(updated)
                    onClose()
                  },
                },
              )
            }
          >
            Resolve
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <div className="flex flex-col gap-sm">
          {DISPUTE_ACTIONS.map((a) => (
            <Card
              key={a.value}
              onClick={() => setAction(a.value)}
              className={`cursor-pointer ${action === a.value ? 'ring-2 ring-primary' : ''}`}
            >
              <p className="text-body font-medium text-text-primary">{a.label}</p>
              <p className="text-caption text-text-secondary">{a.detail}</p>
            </Card>
          ))}
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
            className="rounded-md border border-border bg-surface px-3 py-sm text-body"
          />
          {/* Required by the server, not merely encouraged. Mediation happens off the platform,
              so this note is the only part of the decision the record ever gets — and this is the
              one decision here with real legal exposure. */}
          <p className="text-caption text-text-secondary">
            Required. The conversation happened off Sentpo; this is the only record of it.
          </p>
        </div>
      </div>
    </Modal>
  )
}

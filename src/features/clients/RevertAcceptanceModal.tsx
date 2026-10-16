import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useRevertAcceptance } from '@/queries/clients'
import { showToast } from '@/lib/toast'
import { isTextOk } from '@/lib/validation'

/**
 * The audited mistake-fix (user decision, 2026-08-28): acceptance is otherwise final, so undoing
 * one demands a reason — it voids the case's commission entry (installment history kept) and
 * returns the college to Offer received, freeing the slot for the right one.
 */
export function RevertAcceptanceModal({
  clientId,
  applicationId,
  courseName,
  onClose,
}: {
  clientId: string
  applicationId: string
  courseName: string
  onClose: () => void
}) {
  const revert = useRevertAcceptance(clientId)
  const [reason, setReason] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isTextOk('reason', reason)) return
    revert.mutate(
      { applicationId, reason: reason.trim() },
      {
        onSuccess: () => {
          showToast(`Acceptance reverted for ${courseName}`)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Undo acceptance"
      widthRem={28}
      footer={
        <>
          {revert.isError && <p className="mr-auto self-center text-body-sm text-error">{revert.error.message}</p>}
          <div className="flex gap-sm">
            <Button
              type="submit"
              form="revert-acceptance-form"
              variant="destructive"
              loading={revert.isPending}
              disabled={!isTextOk('reason', reason)}
            >
              Undo acceptance
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <form id="revert-acceptance-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          <strong className="text-text-primary">{courseName}</strong> goes back to Offer received and its commission
          entry is voided. The reason lands in the audit log.
        </p>
        <TextField kind="reason" label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
      </form>
    </Modal>
  )
}

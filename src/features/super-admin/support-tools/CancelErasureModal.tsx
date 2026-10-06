import { useState } from 'react'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { TextAreaField } from '@/components/TextAreaField'
import { formatDate } from '@/lib/time'
import { showToast } from '@/lib/toast'
import { useCancelErasure } from '@/queries/supportTools'

/**
 * "Keep this account": cancels a scheduled erasure (gate 12f; Super Admin, with a reason). Used
 * from the Pending erasures list and from a user's Actions popup, so both ask the same question
 * in the same words. It says the one thing that surprises people: what closed when the erasure
 * was requested stays closed.
 */
export function CancelErasureModal({
  userId,
  name,
  dueAt,
  onClose,
  onCancelled,
}: {
  userId: string
  name: string
  dueAt: string
  onClose: () => void
  onCancelled?: () => void
}) {
  const cancel = useCancelErasure()
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)

  function handleKeep() {
    if (!reason.trim()) {
      setAttempted(true)
      return
    }
    cancel.mutate(
      { userId, reason: reason.trim() },
      {
        onSuccess: () => {
          showToast(`${name}’s account is kept. They can sign in again`)
          onCancelled?.()
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={`Keep ${name}’s account?`}
      widthRem={30}
      footer={
        <>
          {cancel.isError && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {cancel.error.message}
            </p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Go back
          </Button>
          <Button loading={cancel.isPending} onClick={handleKeep}>
            Keep account
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          The erasure scheduled for <strong className="text-text-primary">{formatDate(dueAt)}</strong> is cancelled.
          Nothing is erased, {name} can sign in again, and their email is told.
        </p>
        <p className="text-body-sm text-text-secondary">Their closed cases and chats stay closed.</p>
        <TextAreaField
          label="Reason"
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Who asked, and how you checked it was them"
          hint="Kept in the audit log."
          error={attempted && !reason.trim() ? 'Add a reason.' : undefined}
        />
      </div>
    </Modal>
  )
}

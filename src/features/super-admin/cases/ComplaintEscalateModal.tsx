import { useState } from 'react'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { TextAreaField } from '@/components/TextAreaField'
import { useEscalateComplaint, type Complaint } from '@/queries/complaints'

/**
 * Turns a complaint into a dispute (2026-09-11). Explains the consequence up front, since it is
 * not obvious from the button label alone: the case freezes for both sides, and the consultancy is
 * told only that the case is under review — never that a complaint exists.
 */
export function ComplaintEscalateModal({
  complaint,
  onClose,
  onEscalated,
}: {
  complaint: Complaint
  onClose: () => void
  onEscalated: (updated: Complaint) => void
}) {
  const escalate = useEscalateComplaint(complaint.id)
  const [reason, setReason] = useState('')

  return (
    <Modal
      onClose={onClose}
      title="Escalate to dispute"
      widthRem={32}
      footer={
        <>
          {escalate.isError && <p className="mr-auto self-center text-body-sm text-error">{escalate.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={escalate.isPending}
            onClick={() =>
              escalate.mutate(reason.trim() || undefined, {
                onSuccess: (updated) => {
                  if (updated) onEscalated(updated)
                  onClose()
                },
              })
            }
          >
            Escalate
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-primary">
          The case pauses for both sides while Sentpo decides. The student is told their case is on hold; the
          consultancy is told the case is under review — it never sees this complaint.
        </p>
        <TextAreaField
          label="Reason (optional)"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What should the mediator know? Defaults to the complaint text if left blank."
        />
      </div>
    </Modal>
  )
}

import { useState } from 'react'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { TextAreaField } from '@/components/TextAreaField'
import { useUpdateComplaint, type Complaint } from '@/queries/complaints'

/**
 * Resolves a complaint (2026-09-11) — mirrors the mandatory-reason convention every other
 * state-changing admin action uses, and blocks outright while an open dispute sits on top of this
 * complaint: resolving the dispute is what closes the complaint too (server enforces the same
 * 409 dispute_open this disables against).
 */
export function ComplaintResolveModal({
  complaint,
  onClose,
  onResolved,
}: {
  complaint: Complaint
  onClose: () => void
  onResolved: (updated: Complaint) => void
}) {
  const update = useUpdateComplaint(complaint.id)
  const [note, setNote] = useState('')
  const blocked = complaint.dispute_status === 'open'

  return (
    <Modal
      onClose={onClose}
      title={`Resolve — ${complaint.student_name ?? 'complaint'}`}
      widthRem={32}
      footer={
        <>
          {update.isError && <p className="mr-auto self-center text-body-sm text-error">{update.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={update.isPending}
            disabled={blocked || !note.trim()}
            onClick={() =>
              update.mutate(
                { status: 'resolved', resolution_note: note.trim() },
                {
                  onSuccess: (updated) => {
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
        {blocked && (
          <p className="rounded-md bg-warning/10 px-md py-sm text-body-sm text-warning">
            Resolve the dispute — this complaint closes with it.
          </p>
        )}
        <TextAreaField
          label="Resolution note"
          required
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={blocked}
          placeholder="What was done about this complaint?"
        />
        <p className="text-caption text-text-secondary">The student sees this note in the app.</p>
      </div>
    </Modal>
  )
}

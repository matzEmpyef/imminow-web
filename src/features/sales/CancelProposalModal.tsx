import type { ReactNode } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { ApiError } from '@/api/errors'
import { useCancelConversionProposal } from '@/queries/leads'
import { isAlreadyApplied, useIdempotencyKey } from '@/lib/useIdempotencyKey'
import { showToast } from '@/lib/toast'

/**
 * The one confirm for taking back something the consultancy sent and nobody has answered
 * (contract gate 12f): an offer on a lead, or a Create Applicant request to an existing student.
 * The caller supplies the words; the cancel itself is the same `DELETE /conversion-proposals/{id}`.
 */
export function CancelProposalModal({
  proposalId,
  title,
  children,
  confirmLabel,
  keepLabel,
  doneMessage,
  refusedMessage,
  onClose,
  onCancelled,
}: {
  proposalId: string
  title: string
  children: ReactNode
  confirmLabel: string
  keepLabel: string
  /** Toast once it is cancelled. */
  doneMessage: string
  /** Shown when the server answers 404: it is not this person's to cancel. */
  refusedMessage: string
  onClose: () => void
  onCancelled?: () => void
}) {
  const cancel = useCancelConversionProposal()
  // One key per opened confirm: a double click is one cancel.
  const { key: idempotencyKey, settle } = useIdempotencyKey()

  function done() {
    showToast(doneMessage)
    onCancelled?.()
    onClose()
  }

  const error = cancel.isError && !isAlreadyApplied(cancel.error) ? cancel.error : null

  return (
    <Modal
      onClose={onClose}
      title={title}
      widthRem={28}
      dismissible
      footer={
        <>
          {error && (
            <p className="mr-auto self-center text-body-sm text-error" role="alert">
              {error instanceof ApiError && error.status === 404 ? refusedMessage : error.message}
            </p>
          )}
          <div className="flex gap-sm">
            <Button variant="secondary" onClick={onClose}>
              {keepLabel}
            </Button>
            <Button
              variant="destructive"
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(
                  { proposalId, idempotencyKey },
                  {
                    onSuccess: done,
                    onError: (err) => {
                      settle(err)
                      // The first attempt landed and only its answer was lost: it is cancelled.
                      if (isAlreadyApplied(err)) done()
                    },
                  },
                )
              }
            >
              {confirmLabel}
            </Button>
          </div>
        </>
      }
    >
      <p className="text-body text-text-secondary">{children}</p>
    </Modal>
  )
}

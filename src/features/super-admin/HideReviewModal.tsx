import { useState } from 'react'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { TextAreaField } from '@/components/TextAreaField'
import { showToast } from '@/lib/toast'
import { useModerateReview, type Review } from '@/queries/adminReviews'

/**
 * Hides a review — mirrors ComplaintResolveModal.tsx's mandatory-reason convention. The reason is
 * required client-side before the request ever goes out; the server's own 400
 * (`details.reason = 'required'`) is mirrored inline too, in case that check is ever bypassed.
 */
export function HideReviewModal({
  review,
  onClose,
  onHidden,
}: {
  review: Review
  onClose: () => void
  onHidden: (updated: Review) => void
}) {
  const moderate = useModerateReview(review.id)
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const clientReasonError = attempted && !reason.trim() ? 'Add a reason.' : undefined
  const serverReasonError =
    moderate.isError && moderate.error instanceof ApiError && moderate.error.details?.reason === 'required'
      ? 'Add a reason.'
      : undefined
  const reasonError = clientReasonError ?? serverReasonError

  function handleHide() {
    if (!reason.trim()) {
      setAttempted(true)
      return
    }
    moderate.mutate(
      { status: 'hidden', reason: reason.trim() },
      {
        onSuccess: (updated) => {
          showToast(`Hidden — no longer visible in the app`)
          if (updated) onHidden(updated)
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={`Hide review — ${review.student_name}`}
      widthRem={32}
      footer={
        <>
          {moderate.isError && !serverReasonError && (
            <p className="mr-auto self-center text-body-sm text-error">{moderate.error.message}</p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" loading={moderate.isPending} onClick={handleHide}>
            Hide
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          Pulls this review from the app immediately. The reason is the audit trail for taking a verified student's
          words down — the review can always be published again later.
        </p>
        <TextAreaField
          label="Reason"
          required
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this being hidden?"
          error={reasonError}
        />
      </div>
    </Modal>
  )
}

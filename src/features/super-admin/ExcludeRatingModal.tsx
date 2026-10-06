import { useState } from 'react'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { TextAreaField } from '@/components/TextAreaField'
import { showToast } from '@/lib/toast'
import { useSetRatingExcluded, type AdminRating } from '@/queries/adminRatings'

/**
 * Takes one rating out of a consultancy's score (owner decision 16). It changes a public number
 * and the student is not told, so it is confirmed here in words that say exactly what happens, and
 * a reason is required: the reason is the audit trail (`rating_excluded`). Same mandatory-reason
 * shape as HideReviewModal; the server's own 400 (`details.reason = 'required'`) is mirrored
 * inline in case the check here is ever bypassed.
 */
export function ExcludeRatingModal({
  rating,
  onClose,
  onExcluded,
}: {
  rating: AdminRating
  onClose: () => void
  onExcluded: (updated: AdminRating) => void
}) {
  const setExcluded = useSetRatingExcluded(rating.id)
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const clientReasonError = attempted && !reason.trim() ? 'Add a reason.' : undefined
  const serverReasonError =
    setExcluded.isError && setExcluded.error instanceof ApiError && setExcluded.error.details?.reason === 'required'
      ? 'Add a reason.'
      : undefined
  const reasonError = clientReasonError ?? serverReasonError
  const student = rating.student_name ?? 'Erased account'

  function handleExclude() {
    if (!reason.trim()) {
      setAttempted(true)
      return
    }
    setExcluded.mutate(
      { excluded: true, reason: reason.trim() },
      {
        onSuccess: (updated) => {
          showToast(`Excluded. ${rating.consultancy_name}’s score no longer counts this rating`)
          if (updated) onExcluded(updated)
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Exclude this rating from the score?"
      widthRem={32}
      footer={
        <>
          {setExcluded.isError && !serverReasonError && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {setExcluded.error.message}
            </p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" loading={setExcluded.isPending} onClick={handleExclude}>
            Exclude from score
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          The rating from <strong className="text-text-primary">{student}</strong> will stop counting towards{' '}
          <strong className="text-text-primary">{rating.consultancy_name}</strong>&rsquo;s score. The score and the
          number of ratings shown to students change straight away.
        </p>
        <ul className="list-disc space-y-xs pl-lg text-body-sm text-text-secondary">
          <li>The student is not told, and still sees their own rating in the app.</li>
          <li>If they rate again, it stays excluded until you restore it.</li>
          <li>A written review is not affected. Hide that from Reviews.</li>
          <li>You can restore the rating at any time.</li>
        </ul>
        <TextAreaField
          label="Reason"
          required
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why should this rating not count?"
          hint="Kept in the audit log."
          error={reasonError}
        />
      </div>
    </Modal>
  )
}

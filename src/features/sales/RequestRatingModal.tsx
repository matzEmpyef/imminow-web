import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useRequestRating } from '@/queries/leads'
import { showToast } from '@/lib/toast'

// Confirms what "Ask for rating" does before sending it (owner decision 16, review F-012). The
// ask is a nudge: the student gets a notification and a prompt in their chat. The server refuses
// it when there has not been enough conversation (409 `not_enough_conversation`) or when this
// consultancy has asked too recently (429); either way its own message is what is shown here.
export function RequestRatingModal({
  leadId,
  leadName,
  onClose,
}: {
  leadId: string
  leadName: string
  onClose: () => void
}) {
  const requestRating = useRequestRating()

  function handleConfirm() {
    requestRating.mutate(leadId, {
      onSuccess: () => {
        showToast(`Rating request sent to ${leadName}`)
        onClose()
      },
    })
  }

  return (
    <Modal
      onClose={onClose}
      title="Ask for rating"
      widthRem={26}
      footer={
        <>
          {requestRating.isError && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {requestRating.error.message}
            </p>
          )}
          <div className="flex gap-sm">
            <Button onClick={handleConfirm} loading={requestRating.isPending}>
              Send request
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          This asks <strong className="text-text-primary">{leadName}</strong> to rate their experience with you so
          far.
        </p>
        <p className="text-body-sm text-text-secondary">
          You can ask this person again after 7 days. They see a prompt in their chat and a notification; the rating
          itself is anonymous and averages into your score.
        </p>
      </div>
    </Modal>
  )
}

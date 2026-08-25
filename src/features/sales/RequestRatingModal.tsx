import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useRequestRating } from '@/queries/leads'

// Confirms what "Request a Rating" actually does before firing it — the 7-day cooldown is a real
// constraint (RATING_COOLDOWN_DAYS on the mock server), not obvious from the button label alone.
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
    requestRating.mutate(leadId, { onSuccess: onClose })
  }

  return (
    <Modal
      onClose={onClose}
      title="Request a Rating"
      widthRem={26}
      footer={
        <>
          {requestRating.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{requestRating.error.message}</p>
          )}
          <div className="flex gap-sm">
            <Button onClick={handleConfirm} loading={requestRating.isPending}>
              Send Request
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
          This asks <strong className="text-text-primary">{leadName}</strong> to rate their experience with your
          consultancy so far.
        </p>
        <p className="text-body-sm text-text-secondary">
          Once requested, you won't be able to request another rating from them for 7 days.
        </p>
      </div>
    </Modal>
  )
}

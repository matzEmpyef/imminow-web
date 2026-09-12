import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'

/**
 * Confirms before taking over a complaint or dispute from whoever currently owns it (review M11,
 * 2026-09-12) — "Take over" used to fire straight from the button click in `OwnerSection`, which
 * is shared between both drawers but out of scope for this session's file list, so the confirm is
 * inserted here at the call site instead (both drawers now open this before mutating).
 */
export function TakeOverConfirmModal({
  ownerName,
  loading,
  error,
  onConfirm,
  onClose,
}: {
  ownerName: string
  loading: boolean
  error?: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      onClose={onClose}
      title="Take over"
      widthRem={26}
      footer={
        <>
          {error && <p className="mr-auto self-center text-body-sm text-error">{error}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={loading} onClick={onConfirm}>
            Take over
          </Button>
        </>
      }
    >
      <p className="text-body-sm text-text-primary">
        Take over from <span className="font-medium">{ownerName}</span>? They&rsquo;ll be told.
      </p>
    </Modal>
  )
}

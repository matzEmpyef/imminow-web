import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useReopenClientCase } from '@/queries/clients'
import { showToast } from '@/lib/toast'
import { ApiError } from '@/api/errors'

// Mirrors ReopenLeadModal.tsx exactly — no reason field, reopening is reversible and low-stakes,
// a confirm just prevents an accidental click on the icon. Named "Reopen Case" throughout the UI
// to stay distinct from the existing "Reopen Plan" action (different meaning, different button).
//
// Some closed cases are not the consultancy's to reopen: one a dispute ended, and (gate 12f) one
// that closed because its student deleted their Sentpo account. The server answers those 409
// `closed_by_platform` with a sentence saying so. That sentence is shown, and Reopen is switched
// off, since pressing it again can only get the same answer.
export function ReopenClientModal({
  clientId,
  clientName,
  onClose,
}: {
  clientId: string
  clientName: string
  onClose: () => void
}) {
  const reopenClient = useReopenClientCase()
  const refusedForGood = reopenClient.error instanceof ApiError && reopenClient.error.code === 'closed_by_platform'

  return (
    <Modal
      onClose={onClose}
      title="Reopen Case"
      widthRem={26}
      footer={
        <>
          {reopenClient.isError && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {reopenClient.error.message}
            </p>
          )}
          <div className="flex gap-sm">
            <Button
              loading={reopenClient.isPending}
              disabled={refusedForGood}
              onClick={() =>
                reopenClient.mutate(clientId, {
                  onSuccess: () => {
                    showToast(`Case reopened for ${clientName}`)
                    onClose()
                  },
                })
              }
            >
              Reopen Case
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
          <strong className="text-text-primary">{clientName}</strong> will move back into Clients List.
        </p>
      </div>
    </Modal>
  )
}

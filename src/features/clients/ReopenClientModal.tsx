import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useReopenClientCase } from '@/queries/clients'

// Mirrors ReopenLeadModal.tsx exactly — no reason field, reopening is reversible and low-stakes,
// a confirm just prevents an accidental click on the icon. Named "Reopen Case" throughout the UI
// to stay distinct from the existing "Reopen Plan" action (different meaning, different button).
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

  return (
    <Modal
      onClose={onClose}
      title="Reopen Case"
      widthRem={26}
      footer={
        <>
          {reopenClient.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{reopenClient.error.message}</p>
          )}
          <div className="flex gap-sm">
            <Button
              loading={reopenClient.isPending}
              onClick={() => reopenClient.mutate(clientId, { onSuccess: onClose })}
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

import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useReopenLead } from '@/queries/leads'

// User-requested — deliberately no permission gate beyond the Ultimate-tier check that already
// covers Close (LeadConversationPage.tsx): "let everyone have access to reopen a closed lead."
// No reason field either, unlike CloseLeadModal.tsx — reopening is reversible and low-stakes, a
// confirm is just to prevent an accidental click on the icon.
export function ReopenLeadModal({
  leadId,
  leadName,
  onClose,
}: {
  leadId: string
  leadName: string
  onClose: () => void
}) {
  const reopenLead = useReopenLead()

  return (
    <Modal
      onClose={onClose}
      title="Reopen Lead"
      widthRem={26}
      footer={
        <>
          {reopenLead.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{reopenLead.error.message}</p>
          )}
          <div className="flex gap-sm">
            <Button loading={reopenLead.isPending} onClick={() => reopenLead.mutate(leadId, { onSuccess: onClose })}>
              Reopen Lead
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
          <strong className="text-text-primary">{leadName}</strong> will move back into Active Leads.
        </p>
      </div>
    </Modal>
  )
}

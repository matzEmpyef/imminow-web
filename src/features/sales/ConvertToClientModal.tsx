import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useProposeConversion } from '@/queries/leads'

// Was its own page (`/sales/leads/:id/propose-conversion`) — folded into a popup off the Lead
// Conversation page (user-requested: "Instead of going to another page, show it on popup. No
// need of new page"), same reasoning as Import Leads becoming a popup earlier. Two states in one
// modal instead of a page + separate success screen: the confirm view, then — once sent — a
// short success view reusing the same Modal instance rather than closing and reopening.
export function ConvertToClientModal({
  leadId,
  leadName,
  onClose,
}: {
  leadId: string
  leadName: string
  onClose: () => void
}) {
  const propose = useProposeConversion()

  if (propose.isSuccess) {
    return (
      <Modal onClose={onClose} title="Proposal sent" widthRem={30} footer={<Button onClick={onClose}>Close</Button>}>
        <p className="text-body text-text-secondary">
          {leadName} has been asked to confirm. This proposal is pending for up to 14 days — you'll be notified once
          they respond.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Propose Conversion"
      widthRem={30}
      footer={
        <>
          {propose.isError && <p className="mr-auto self-center text-body-sm text-error">{propose.error.message}</p>}
          <div className="flex gap-sm">
            <Button onClick={() => propose.mutate(leadId)} loading={propose.isPending}>
              Send Proposal
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <p className="text-body text-text-secondary">
        You're about to propose that <strong className="text-text-primary">{leadName}</strong> becomes your client.
        Here's what they'll see:
      </p>
      <ul className="mt-md flex flex-col gap-xs text-body-sm text-text-primary">
        <li>• A request to confirm you as their consultancy</li>
        <li>• Once the aspirant accepts the request, they will be exclusively your client</li>
        <li>• The proposal expires automatically after 14 days if they don't respond</li>
      </ul>
    </Modal>
  )
}

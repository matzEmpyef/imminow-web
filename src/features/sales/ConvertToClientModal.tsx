import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useProposeConversion } from '@/queries/leads'
import { useIdempotencyKey } from '@/lib/useIdempotencyKey'

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
  // T8: one key per modal open — double-clicking Send is one operation, not two proposals.
  const { key: idempotencyKey, settle } = useIdempotencyKey()

  if (propose.isSuccess) {
    return (
      <Modal
        onClose={onClose}
        title="Request sent"
        widthRem={30}
        footer={<Button onClick={onClose}>Close</Button>}
        dismissible
      >
        <p className="text-body text-text-secondary">
          {leadName} has been asked to confirm. The request stays open for up to 14 days — you'll be notified once
          they respond.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Send a request"
      widthRem={30}
      footer={
        <>
          {/* The server's own sentence, as it arrives: the cooldown after a recent offer to this person
              (`request_cooldown`) and the day's allowance of offers (`limit_reached`) both say when
              asking is possible again. */}
          {propose.isError && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {propose.error.message}
            </p>
          )}
          <div className="flex gap-sm">
            <Button
              onClick={() => !propose.isPending && propose.mutate({ id: leadId, idempotencyKey }, { onError: settle })}
              loading={propose.isPending}
            >
              Send request
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <p className="text-body text-text-secondary">
        You're about to ask <strong className="text-text-primary">{leadName}</strong> to become your client.
        Here's what they'll see:
      </p>
      <ul className="mt-md flex flex-col gap-xs text-body-sm text-text-primary">
        <li>• A request to confirm you as their consultancy</li>
        <li>• Once {leadName} accepts, they are your client only, and their chats with other consultancies close.</li>
        <li>• The request expires after 14 days if they do not answer.</li>
      </ul>
    </Modal>
  )
}

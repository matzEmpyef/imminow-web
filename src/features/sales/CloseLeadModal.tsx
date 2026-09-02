import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useCloseLead } from '@/queries/leads'

// User-requested — closing a lead that's gone dry. Ultimate tier + `leads.close` gate this
// button's visibility (LeadConversationPage.tsx); this modal itself just asks for the required
// reason and confirms, same shape as ConvertToClientModal.tsx's confirm step.
export function CloseLeadModal({
  leadId,
  leadName,
  onClose,
}: {
  leadId: string
  leadName: string
  onClose: () => void
}) {
  const closeLead = useCloseLead()
  const [reason, setReason] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!reason.trim()) return
    closeLead.mutate({ id: leadId, reason: reason.trim() }, { onSuccess: onClose })
  }

  return (
    <Modal
      onClose={onClose}
      title="Close Lead"
      widthRem={28}
      footer={
        <>
          {closeLead.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{closeLead.error.message}</p>
          )}
          <div className="flex gap-sm">
            <Button
              type="submit"
              form="close-lead-form"
              variant="destructive"
              loading={closeLead.isPending}
              disabled={!reason.trim()}
            >
              Close Lead
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <form id="close-lead-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          <strong className="text-text-primary">{leadName}</strong> will drop out of Active Leads until reopened. This
          doesn't delete anything — the full conversation and history stay intact.
        </p>
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="close-lead-reason">
            Reason
          </label>
          <textarea
            id="close-lead-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this lead being closed?"
            className="rounded-md border border-border bg-surface px-3 py-sm text-body"
          />
        </div>
      </form>
    </Modal>
  )
}

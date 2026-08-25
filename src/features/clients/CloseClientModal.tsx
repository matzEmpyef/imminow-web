import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useCloseClient } from '@/queries/clients'

// User-requested — "similar to leads we need option to close a client as well." Mirrors
// CloseLeadModal.tsx exactly. Distinct from Transfer Applicant (consultancy switch) and Reopen
// Plan (reopens the last step after plan_complete) — neither of those is touched by this.
export function CloseClientModal({
  clientId,
  clientName,
  onClose,
}: {
  clientId: string
  clientName: string
  onClose: () => void
}) {
  const closeClient = useCloseClient()
  const [reason, setReason] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!reason.trim()) return
    closeClient.mutate({ id: clientId, reason: reason.trim() }, { onSuccess: onClose })
  }

  return (
    <Modal
      onClose={onClose}
      title="Close Case"
      widthRem={28}
      footer={
        <>
          {closeClient.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{closeClient.error.message}</p>
          )}
          <div className="flex gap-sm">
            <Button
              type="submit"
              form="close-client-form"
              variant="destructive"
              loading={closeClient.isPending}
              disabled={!reason.trim()}
            >
              Close Case
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <form id="close-client-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          <strong className="text-text-primary">{clientName}</strong> will drop out of Clients List until reopened. This
          doesn't delete anything — the full case history stays intact.
        </p>
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="close-client-reason">
            Reason
          </label>
          <textarea
            id="close-client-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this case being closed?"
            className="rounded-md border border-border bg-surface px-3 py-2 text-body"
          />
        </div>
      </form>
    </Modal>
  )
}

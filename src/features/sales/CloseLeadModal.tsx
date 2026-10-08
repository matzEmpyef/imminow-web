import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useCloseLead } from '@/queries/leads'
import { CLOSE_REASONS, type CloseReason } from '@/lib/clientStatus'
import { showToast } from '@/lib/toast'

// User-requested — closing a lead that's gone dry. Ultimate tier + `leads.close` gate this
// button's visibility (LeadConversationPage.tsx); this modal asks for the reason and confirms,
// same shape as ConvertToClientModal.tsx's confirm step.
//
// The reason is picked from the list a case closes on (owner decision 69b, 2026-10-08), with the
// labels Close Case uses (`CLOSE_REASONS`), and a note beside it. "Something else" needs the
// note: the server refuses it without one, so the button waits for it here.
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
  const [reason, setReason] = useState<CloseReason | ''>('')
  const [note, setNote] = useState('')

  const noteRequired = reason === 'other'
  const canSubmit = reason !== '' && (!noteRequired || Boolean(note.trim()))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (reason === '' || !canSubmit) return
    closeLead.mutate(
      { id: leadId, reason, note: note.trim() || undefined },
      {
        onSuccess: () => {
          showToast('Lead closed')
          onClose()
        },
      },
    )
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
              disabled={!canSubmit}
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
          <strong className="text-text-primary">{leadName}</strong> will drop out of your lead lists until reopened. This
          doesn't delete anything — the full conversation and history stay intact.
        </p>
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="close-lead-reason">
            Reason
          </label>
          <select
            id="close-lead-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as CloseReason | '')}
            className="rounded-md border border-border bg-surface px-3 py-sm text-body"
          >
            <option value="">Select one…</option>
            {CLOSE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="close-lead-note">
            Note{noteRequired ? '' : ' (optional)'}
          </label>
          <textarea
            id="close-lead-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={noteRequired ? 'Please say what happened.' : 'Anything worth adding for the record?'}
            className="rounded-md border border-border bg-surface px-3 py-sm text-body"
          />
        </div>
      </form>
    </Modal>
  )
}

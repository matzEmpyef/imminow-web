import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { CLOSE_SUB_REASONS, useCloseClient, type CloseSubReason } from '@/queries/clients'

// The sub-reasons that mean the student never actually travelled. An acceptance plus one of these
// is a FAILURE, not a success — colleges don't pay for a student who doesn't arrive — and the
// commission entry is reversed rather than recognised. Kept in step with the server's own list.
const DID_NOT_GO: CloseSubReason[] = ['visa_refused', 'student_withdrew', 'lost_contact']

/**
 * Closing a case (user-requested; mirrors CloseLeadModal). Since 2026-09-09 the OUTCOME IS
 * DERIVED, never chosen — a consultancy can't close as a failure to dodge the commission, or
 * claim success without an accepted college. This modal's job is to make that derivation visible
 * BEFORE the consultant commits, because the same button now moves money.
 *
 * Distinct from Raise an Issue, which freezes the case for platform mediation instead of ending
 * it: "the student wouldn't cooperate" is an accusation, not an outcome, and doesn't belong here.
 */
export function CloseClientModal({
  clientId,
  clientName,
  hasAcceptedCollege,
  onClose,
}: {
  clientId: string
  clientName: string
  hasAcceptedCollege: boolean
  onClose: () => void
}) {
  const closeClient = useCloseClient()
  const [reason, setReason] = useState('')
  const [subReason, setSubReason] = useState<CloseSubReason | ''>('')

  const didNotGo = subReason !== '' && DID_NOT_GO.includes(subReason)
  const outcome: 'success' | 'failure' = hasAcceptedCollege && !didNotGo ? 'success' : 'failure'
  // A failure has to say why. A success doesn't need one, and asking for it would invite a
  // consultant to pick something that silently turns their own success into a failure.
  const subReasonRequired = !hasAcceptedCollege
  const canSubmit = Boolean(reason.trim()) && (!subReasonRequired || subReason !== '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    closeClient.mutate(
      {
        id: clientId,
        reason: reason.trim(),
        ...(subReason !== '' ? { subReason } : {}),
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Close Case"
      widthRem={30}
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
              disabled={!canSubmit}
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
          <strong className="text-text-primary">{clientName}</strong> drops out of Clients List and returns to Stage 1,
          free to start again with any consultancy. Nothing is deleted — the full case history stays intact.
        </p>

        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="close-client-sub-reason">
            What happened{subReasonRequired ? '' : ' (optional)'}
          </label>
          <select
            id="close-client-sub-reason"
            value={subReason}
            onChange={(e) => setSubReason(e.target.value as CloseSubReason | '')}
            className="rounded-md border border-border bg-surface px-3 py-sm text-body"
          >
            <option value="">{hasAcceptedCollege ? 'The student is going — nothing went wrong' : 'Select one…'}</option>
            {CLOSE_SUB_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* The consequence, spelled out. This button moves money now, and a consultant should not
            have to infer which way from a dropdown they just changed. */}
        <p
          className={`rounded-md px-3 py-sm text-body-sm ${
            outcome === 'success' ? 'bg-success-subtle text-text-primary' : 'bg-surface-muted text-text-secondary'
          }`}
        >
          {outcome === 'success' ? (
            <>
              This closes as a <strong>success</strong>. The commission on the accepted college becomes due.
            </>
          ) : hasAcceptedCollege ? (
            <>
              This closes as a <strong>failure</strong>. The student was accepted but isn&rsquo;t travelling, so the
              commission is reversed.
            </>
          ) : (
            <>
              This closes as a <strong>failure</strong>. No college was accepted, so no commission arises.
            </>
          )}
        </p>

        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="close-client-reason">
            Notes
          </label>
          <textarea
            id="close-client-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="What should the record say?"
            className="rounded-md border border-border bg-surface px-3 py-sm text-body"
          />
          <p className="text-body-sm text-text-secondary">The student is told their case closed, and sees this note.</p>
        </div>
      </form>
    </Modal>
  )
}

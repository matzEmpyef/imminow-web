import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { CancelProposalModal } from './CancelProposalModal'
import { useRespondToConversion } from '@/queries/leads'
import { PROPOSAL_ENDED_LABEL } from '@/lib/applicantRequestWords'
import { showToast } from '@/lib/toast'
import { ALREADY_APPLIED_NOTICE, isAlreadyApplied, usePayloadIdempotencyKey } from '@/lib/useIdempotencyKey'
import { formatDate } from '@/lib/time'
import type { components } from '@/api/schema'

type ConversionProposal = components['schemas']['ConversionProposal']

// User-asked (2026-08-19) — "student can also initiate a Convert to client." Whichever side did
// *not* initiate is the one who approves/declines; consultant-initiated proposals still show
// the old "awaiting response" pill (there's nothing for the consultant to action until the
// student responds — and that side genuinely can't happen in this codebase, no student login
// exists), while a student-initiated one shows real Approve/Decline buttons. Navigates straight
// to the new Client Profile on approval rather than leaving the consultant on the now-closed
// lead.
//
// Contract gate 12f: the sender can take a pending proposal back. Staff cancel their own offer
// here (Cancel offer, with a confirm); a student withdraws theirs in the app, and a proposal that
// is no longer pending says how it ended rather than offering buttons that would be refused.
//
// Owner decision 6 (review F-055, 2026-10-07): answering a student's request needs the "convert
// leads" permission, for Approve and Decline alike. Without it the request is still shown, as a
// fact with no buttons. Cancelling an offer the consultancy sent needs only sight of the lead,
// so that stays for everyone who can open this page.
export function ConversionApprovalActions({
  leadId,
  leadName,
  proposal,
  canConvert,
}: {
  leadId: string
  leadName: string
  proposal: ConversionProposal
  /** The reader may convert this lead (`useCanConvertLead`). */
  canConvert: boolean
}) {
  const navigate = useNavigate()
  const respond = useRespondToConversion(leadId)
  // One key per answer, kept while this offer is on screen (review F-297): pressing Approve again
  // after a lost reply replays the first answer instead of being refused as already done.
  const { keyFor, settle } = usePayloadIdempotencyKey()
  // Approve or Decline: sends the key for exactly this answer, and when the server says it was
  // already recorded, says so (the lists are refreshed by the mutation) rather than showing a failure.
  function answer(decision: 'approved' | 'declined', onDone: (clientId: string | undefined) => void) {
    respond.mutate(
      { proposalId: proposal.id, decision, idempotencyKey: keyFor({ proposalId: proposal.id, decision }) },
      {
        onSuccess: (data) => onDone(data.client_id),
        onError: (err) => {
          settle(err)
          if (isAlreadyApplied(err)) showToast(ALREADY_APPLIED_NOTICE)
        },
      },
    )
  }
  const [confirmCancel, setConfirmCancel] = useState(false)

  if (proposal.status !== 'pending') {
    return (
      <div className="rounded-full bg-background px-sm py-1.5 text-caption text-text-secondary">
        {PROPOSAL_ENDED_LABEL[proposal.status]}
      </div>
    )
  }

  if (proposal.initiated_by !== 'student') {
    return (
      <div className="flex items-center gap-sm">
        <div className="rounded-full bg-background px-sm py-1.5 text-caption text-text-secondary">
          Awaiting {leadName}'s response — expires {formatDate(proposal.expires_at)}
        </div>
        <Button variant="secondary" size="sm" onClick={() => setConfirmCancel(true)}>
          Cancel offer
        </Button>
        {confirmCancel && (
          <CancelProposalModal
            proposalId={proposal.id}
            title="Cancel offer"
            confirmLabel="Cancel offer"
            keepLabel="Keep offer"
            doneMessage="Offer cancelled"
            refusedMessage="You can't cancel this offer."
            onClose={() => setConfirmCancel(false)}
          >
            Cancel this offer? {leadName} will no longer be able to accept it.
          </CancelProposalModal>
        )}
      </div>
    )
  }

  if (!canConvert) {
    return (
      <div className="rounded-full bg-background px-sm py-1.5 text-caption text-text-secondary">
        {leadName} has asked to become a client
      </div>
    )
  }

  return (
    <div className="flex items-center gap-sm rounded-md border border-primary bg-primary-subtle px-sm py-1.5">
      <span className="text-caption font-medium text-primary">{leadName} wants to become a client</span>
      {respond.isError && !isAlreadyApplied(respond.error) && (
        <p className="text-caption text-error">{respond.error.message}</p>
      )}
      <Button
        loading={respond.isPending && respond.variables?.decision === 'approved'}
        onClick={() => answer('approved', (clientId) => clientId && navigate(`/clients/${clientId}`))}
      >
        Approve
      </Button>
      <Button
        variant="secondary"
        loading={respond.isPending && respond.variables?.decision === 'declined'}
        onClick={() => answer('declined', () => showToast('Conversion declined'))}
      >
        Decline
      </Button>
    </div>
  )
}

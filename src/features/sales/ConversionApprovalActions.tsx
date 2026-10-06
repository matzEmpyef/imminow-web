import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { CancelProposalModal } from './CancelProposalModal'
import { useRespondToConversion } from '@/queries/leads'
import { PROPOSAL_ENDED_LABEL } from '@/lib/applicantRequestWords'
import { showToast } from '@/lib/toast'
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
export function ConversionApprovalActions({
  leadId,
  leadName,
  proposal,
}: {
  leadId: string
  leadName: string
  proposal: ConversionProposal
}) {
  const navigate = useNavigate()
  const respond = useRespondToConversion(leadId)
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

  return (
    <div className="flex items-center gap-sm rounded-md border border-primary bg-primary-subtle px-sm py-1.5">
      <span className="text-caption font-medium text-primary">{leadName} wants to become a client</span>
      {respond.isError && <p className="text-caption text-error">{respond.error.message}</p>}
      <Button
        loading={respond.isPending && respond.variables?.decision === 'approved'}
        onClick={() =>
          respond.mutate(
            { proposalId: proposal.id, decision: 'approved' },
            { onSuccess: (data) => data.client_id && navigate(`/clients/${data.client_id}`) },
          )
        }
      >
        Approve
      </Button>
      <Button
        variant="secondary"
        loading={respond.isPending && respond.variables?.decision === 'declined'}
        onClick={() =>
          respond.mutate(
            { proposalId: proposal.id, decision: 'declined' },
            { onSuccess: () => showToast('Conversion declined') },
          )
        }
      >
        Decline
      </Button>
    </div>
  )
}

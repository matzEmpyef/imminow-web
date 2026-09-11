import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { CLOSE_SUB_REASONS, useCloseClient, type CloseSubReason } from '@/queries/clients'
import { showToast } from '@/lib/toast'

// The sub-reasons that mean the student never actually travelled. An acceptance plus one of these
// is a FAILURE, not a success — colleges don't pay for a student who doesn't arrive — and the
// commission entry is reversed rather than recognised. Kept in step with the server's own list.
const DID_NOT_GO: CloseSubReason[] = ['visa_refused', 'student_withdrew', 'lost_contact']

/**
 * Closing a case (user-requested; mirrors CloseLeadModal). Since 2026-09-09 the OUTCOME IS
 * DERIVED, never chosen — a consultancy can't close as a failure to dodge the commission, or
 * claim success without the thing that earns it. This modal's job is to make that derivation
 * visible BEFORE the consultant commits, because the same button now moves money.
 *
 * What earns a success depends on the case type (2026-09-10): a student case needs a college
 * marked Accepted; a PR case, which has no colleges, needs the applicant's contribution recorded.
 * Without it the dropdown still lists Success, greyed out, and a note says how to get there
 * (user: "mention these things — how to close successfully"). With it, a note warns that the case
 * can still fail if the student doesn't go.
 *
 * Distinct from Raise an Issue, which freezes the case for platform mediation instead of ending
 * it: "the student wouldn't cooperate" is an accusation, not an outcome, and doesn't belong here.
 */
export function CloseClientModal({
  clientId,
  clientName,
  caseType,
  hasAcceptedCollege,
  contributionRecorded,
  canOpenCommissions,
  onClose,
}: {
  clientId: string
  clientName: string
  caseType: 'student' | 'pr'
  hasAcceptedCollege: boolean
  contributionRecorded: boolean
  /** Whether this consultant can see the Commissions tab, where a PR contribution is recorded. */
  canOpenCommissions: boolean
  onClose: () => void
}) {
  const closeClient = useCloseClient()
  const [reason, setReason] = useState('')
  const [subReason, setSubReason] = useState<CloseSubReason | ''>('')

  const isPr = caseType === 'pr'
  const earned = isPr ? contributionRecorded : hasAcceptedCollege
  const didNotGo = subReason !== '' && DID_NOT_GO.includes(subReason)
  const outcome: 'success' | 'failure' = earned && !didNotGo ? 'success' : 'failure'
  // A failure has to say why. A success doesn't need one, and asking for it would invite a
  // consultant to pick something that silently turns their own success into a failure.
  const subReasonRequired = !earned
  const canSubmit = Boolean(reason.trim()) && (!subReasonRequired || subReason !== '')
  // A PR case was never sent to colleges, so "rejected by the colleges" can't be what happened.
  const subReasons = isPr ? CLOSE_SUB_REASONS.filter((r) => r.value !== 'rejected_by_colleges') : CLOSE_SUB_REASONS
  const money = isPr ? 'contribution' : 'commission'

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    closeClient.mutate(
      {
        id: clientId,
        reason: reason.trim(),
        ...(subReason !== '' ? { subReason } : {}),
      },
      {
        onSuccess: () => {
          showToast(`Case closed for ${clientName}`)
          onClose()
        },
      },
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
              // A success is the good ending, not a destructive act (user, 2026-09-10) — only a
              // failure keeps the red button.
              variant={outcome === 'success' ? 'primary' : 'destructive'}
              loading={closeClient.isPending}
              disabled={!canSubmit}
            >
              {outcome === 'success' ? 'Close as Success' : 'Close Case'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <form id="close-client-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        {/* "Returns to Stage 1, free to start again" read wrong for a student who got in and is
            going (user, 2026-09-10), so the success wording talks about the case being done. */}
        <p className="text-body-sm text-text-secondary">
          {outcome === 'success' ? (
            <>
              <strong className="text-text-primary">{clientName}</strong>&rsquo;s case is complete and moves out of
              your Clients List. Nothing is deleted — the full case history stays intact.
            </>
          ) : (
            <>
              <strong className="text-text-primary">{clientName}</strong> drops out of Clients List and returns to
              Stage 1, free to start again with any consultancy. Nothing is deleted — the full case history stays
              intact.
            </>
          )}
        </p>

        {/* How a case closes as a success — the answer to "why is Success greyed out?". */}
        {!earned && (
          <div className="rounded-md border border-border bg-background px-3 py-sm text-body-sm text-text-secondary">
            <p className="font-medium text-text-primary">Want to close this as a success?</p>
            {isPr ? (
              <p className="mt-xs">
                A PR case closes as a success only once the applicant&rsquo;s contribution is recorded.
                {canOpenCommissions
                  ? ' Record it in the Commissions tab, then come back here.'
                  : ' Ask an admin to record it in the Commissions tab, then come back here.'}
              </p>
            ) : (
              <p className="mt-xs">
                A case closes as a success only once a college is marked <strong>Accepted</strong>. In the Applications
                tab, move the college the student is joining to Offer Received, then choose Accept&hellip; and record
                the commission. Come back here afterwards.
              </p>
            )}
            {(!isPr || canOpenCommissions) && (
              <Link
                to={`/clients/${clientId}?tab=${isPr ? 'Commissions' : 'Applications'}`}
                onClick={onClose}
                className="mt-xs inline-block font-medium text-primary hover:underline"
              >
                {isPr ? 'Go to Commissions' : 'Go to Applications'}
              </Link>
            )}
          </div>
        )}

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
            {earned ? (
              <option value="">{isPr ? 'Success — the case went through' : 'Success — the student is going'}</option>
            ) : (
              <>
                <option value="">Select one…</option>
                {/* Listed so the consultant sees the option exists; the note above says how to
                    reach it. Not selectable — the outcome is derived, never picked. */}
                <option value="__success" disabled>
                  {isPr ? 'Success — needs a recorded contribution' : 'Success — needs an accepted college'}
                </option>
              </>
            )}
            {subReasons.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {earned && (
            <p className="text-caption text-text-secondary">
              {isPr ? 'A case with a recorded contribution' : 'An accepted case'} can still fail. If the visa was
              refused, the {isPr ? 'applicant' : 'student'} withdrew, or you lost contact, choose that here — it closes
              as a failure and the {money} is reversed.
            </p>
          )}
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
              This closes as a <strong>success</strong>.{' '}
              {isPr ? 'The recorded contribution becomes due.' : 'The commission on the accepted college becomes due.'}
            </>
          ) : earned ? (
            <>
              This closes as a <strong>failure</strong>.{' '}
              {isPr
                ? 'The contribution was recorded but the case didn’t go through, so it is reversed.'
                : 'The student was accepted but isn’t travelling, so the commission is reversed.'}
            </>
          ) : (
            <>
              This closes as a <strong>failure</strong>.{' '}
              {isPr ? 'No contribution was recorded, so no commission arises.' : 'No college was accepted, so no commission arises.'}
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

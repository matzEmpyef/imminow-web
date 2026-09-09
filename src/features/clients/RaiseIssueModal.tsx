import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useRaiseIssue } from '@/queries/clients'

/**
 * Raise an issue with a case (2026-09-09). Deliberately a separate action from Close Case, and
 * the separation is the point: "the student wouldn't cooperate" is an accusation, not an outcome.
 * A consultancy that could end someone's case by asserting fault would leave the student no reply
 * and no route back, so that path freezes the case for platform mediation instead.
 */
export function RaiseIssueModal({
  clientId,
  clientName,
  onClose,
}: {
  clientId: string
  clientName: string
  onClose: () => void
}) {
  const raiseIssue = useRaiseIssue()
  const [reason, setReason] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!reason.trim()) return
    raiseIssue.mutate({ id: clientId, reason: reason.trim() }, { onSuccess: onClose })
  }

  return (
    <Modal
      onClose={onClose}
      title="Raise an Issue"
      widthRem={30}
      footer={
        <>
          {raiseIssue.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{raiseIssue.error.message}</p>
          )}
          <div className="flex gap-sm">
            <Button
              type="submit"
              form="raise-issue-form"
              loading={raiseIssue.isPending}
              disabled={!reason.trim()}
            >
              Raise Issue
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <form id="raise-issue-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          Use this when something has gone wrong between you and{' '}
          <strong className="text-text-primary">{clientName}</strong> that you can&rsquo;t resolve yourselves. Sentpo
          will speak to both sides.
        </p>

        {/* Said plainly, because a consultant reaching for this button is usually frustrated and
            needs to know it stops their own work too, not just the student's. */}
        <div className="rounded-md bg-surface-muted px-3 py-sm text-body-sm text-text-secondary">
          <p className="mb-xs font-medium text-text-primary">While Sentpo reviews this case:</p>
          <ul className="ml-md list-disc">
            <li>the plan is paused for both of you</li>
            <li>chat with the student stops</li>
            <li>you can&rsquo;t close the case — Sentpo decides how it ends</li>
          </ul>
        </div>

        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="raise-issue-reason">
            What&rsquo;s happened
          </label>
          <textarea
            id="raise-issue-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Give Sentpo enough to go on — dates, what you've already tried."
            className="rounded-md border border-border bg-surface px-3 py-sm text-body"
          />
          <p className="text-body-sm text-text-secondary">
            The student is told their case is under review, but not what you wrote here.
          </p>
        </div>
      </form>
    </Modal>
  )
}

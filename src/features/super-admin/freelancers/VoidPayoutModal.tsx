import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { useVoidFreelancerPayout } from '@/queries/freelancerReferrals'
import type { FreelancerPayout } from '@/queries/freelancerReferrals'
import { showToast } from '@/lib/toast'

const MIN_REASON_LENGTH = 3

function inr(n: number | undefined | null): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

/** Undoes a recorded payout — the amount becomes owed again immediately. */
export function VoidPayoutModal({ payout, onClose }: { payout: FreelancerPayout; onClose: () => void }) {
  const voidPayout = useVoidFreelancerPayout()
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()

  return (
    <Modal
      onClose={onClose}
      title={`Undo payout — ${inr(payout.amount_inr)}`}
      widthRem={28}
      footer={
        <>
          {voidPayout.isError && <p className="mr-auto self-center text-body-sm text-error">{voidPayout.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={voidPayout.isPending}
            disabled={trimmed.length < MIN_REASON_LENGTH}
            onClick={() =>
              voidPayout.mutate(
                { id: payout.id, reason: trimmed },
                {
                  onSuccess: () => {
                    showToast(`Payout undone for ${payout.freelancer_name}`)
                    onClose()
                  },
                },
              )
            }
          >
            Undo payout
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          {payout.freelancer_name} was paid {inr(payout.amount_inr)}
          {payout.applicant_name ? ` for ${payout.applicant_name}` : ''}. Undoing this makes the amount owed again.
        </p>
        <TextAreaField
          label="Reason"
          required
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="Kept on record — the freelancer can see this reason."
        />
      </div>
    </Modal>
  )
}

import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useRecordFreelancerPayout } from '@/queries/freelancerReferrals'
import type { FreelancerReferral } from '@/queries/freelancerReferrals'
import { localDateISO } from '@/lib/time'

function inr(n: number | undefined | null): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

interface Result {
  succeeded: number
  failed: number
}

/**
 * Records a payout for every selected referral in one go (2026-09-11), each for its own full owed
 * amount, sharing one paid-on date and reference across the batch — the same "run sequentially,
 * report a partial result" shape as Finance's BulkConfirmModal, since the payouts endpoint only
 * ever takes one referral at a time.
 */
export function BulkRecordPayoutModal({
  referrals,
  onClose,
  onDone,
}: {
  referrals: FreelancerReferral[]
  onClose: () => void
  onDone: () => void
}) {
  const recordPayout = useRecordFreelancerPayout()
  const [paidOn, setPaidOn] = useState(localDateISO())
  const [reference, setReference] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const total = referrals.reduce((sum, r) => sum + (r.owed_inr ?? 0), 0)

  async function handleConfirm() {
    setRunning(true)
    let succeeded = 0
    let failed = 0
    for (const referral of referrals) {
      try {
        await recordPayout.mutateAsync({
          referralId: referral.id,
          amount_inr: referral.owed_inr ?? 0,
          paid_on: paidOn,
          reference: reference || undefined,
        })
        succeeded++
      } catch {
        failed++
      }
    }
    setRunning(false)
    setResult({ succeeded, failed })
    onDone()
  }

  return (
    <Modal
      onClose={onClose}
      title={`Record ${referrals.length} payout${referrals.length === 1 ? '' : 's'}`}
      widthRem={28}
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={running}>
              Cancel
            </Button>
            <Button loading={running} disabled={!paidOn} onClick={handleConfirm}>
              Record {referrals.length} payout{referrals.length === 1 ? '' : 's'} (₹{total.toLocaleString('en-IN')})
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-md">
        {result ? (
          <p className="text-body-sm text-text-primary">
            {result.succeeded} recorded
            {result.failed > 0 ? `, ${result.failed} failed — try those again individually.` : '.'}
          </p>
        ) : (
          <>
            <p className="text-body-sm text-text-secondary">
              Each freelancer is paid their full owed amount as of now. One date and reference applies to every
              payout in this batch.
            </p>
            <div className="flex max-h-64 flex-col gap-xs overflow-y-auto rounded-md border border-border">
              {referrals.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-sm border-b border-border px-sm py-xs last:border-b-0">
                  <span className="text-body-sm text-text-primary">
                    {r.freelancer_name} · {r.applicant_name}
                  </span>
                  <span className="text-body-sm tabular-nums text-text-primary">{inr(r.owed_inr)}</span>
                </div>
              ))}
            </div>
            <TextField
              label="Paid on"
              type="date"
              required
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
            />
            <TextField
              label="Reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UPI / bank reference"
            />
          </>
        )}
      </div>
    </Modal>
  )
}

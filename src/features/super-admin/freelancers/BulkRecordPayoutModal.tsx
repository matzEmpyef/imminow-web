import { useCallback, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { BatchResultList } from '@/components/BatchResultList'
import { batchSummary, useBatchRun } from '@/lib/useBatchRun'
import { useRecordFreelancerPayout } from '@/queries/freelancerReferrals'
import type { FreelancerReferral } from '@/queries/freelancerReferrals'
import { localDateISO } from '@/lib/time'
import { inr } from '@/lib/money'

/**
 * Records a payout for every selected referral in one go (2026-09-11), each for its own full owed
 * amount, sharing one paid-on date and reference across the batch — the same "run sequentially"
 * shape as Finance's BulkConfirmModal, since the payouts endpoint only ever takes one referral at
 * a time.
 *
 * Like it, the dialog cannot be closed while the batch runs, "Stop after this one" ends it between
 * two payouts, and the result names every payout with what happened to it (review F-153). It used
 * to say how many failed and show only the first failure's reason. See `useBatchRun`.
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
  const { mutateAsync: recordOne } = useRecordFreelancerPayout()
  const [paidOn, setPaidOn] = useState(localDateISO())
  const [reference, setReference] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [batchKey] = useState(() => crypto.randomUUID())
  const total = referrals.reduce((sum, r) => sum + (r.owed_inr ?? 0), 0)
  const paidOnError = attempted && !paidOn ? 'Pick the date these were paid.' : undefined

  const batch = useBatchRun<FreelancerReferral>(
    useCallback(
      (referral) =>
        recordOne({
          referralId: referral.id,
          idempotencyKey: `${batchKey}-${referral.id}`,
          amount_inr: referral.owed_inr ?? 0,
          paid_on: paidOn,
          reference: reference || undefined,
        }),
      [recordOne, batchKey, paidOn, reference],
    ),
  )

  async function handleConfirm() {
    if (!paidOn) {
      setAttempted(true)
      return
    }
    await batch.start(referrals)
    onDone()
  }

  const started = batch.running || batch.finished
  const sentSoFar = batch.rows.filter((row) => row.status !== 'waiting').length
  // Once started, the batch is what was started, whatever happens to the selection behind it.
  const count = started ? batch.rows.length : referrals.length

  return (
    <Modal
      onClose={onClose}
      locked={batch.running}
      title={`Record ${count} payout${count === 1 ? '' : 's'}`}
      widthRem={28}
      footer={
        batch.finished ? (
          <Button onClick={onClose}>Done</Button>
        ) : batch.running ? (
          <Button variant="secondary" onClick={batch.stop} disabled={batch.stopping}>
            {batch.stopping ? 'Stopping…' : 'Stop after this one'}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleConfirm}>
              Record {referrals.length} payout{referrals.length === 1 ? '' : 's'} (₹{total.toLocaleString('en-IN')})
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-md">
        {started ? (
          <>
            <p role="status" className="text-body-sm text-text-primary">
              {batch.running
                ? `Recording ${Math.min(sentSoFar, batch.rows.length)} of ${batch.rows.length}… Keep this window open until it finishes.`
                : batchSummary(batch.counts, 'recorded')}
            </p>
            <BatchResultList
              rows={batch.rows}
              rowKey={(r) => r.id}
              words={{ done: 'Recorded', running: 'Recording…' }}
              renderLabel={(r) => (
                <>
                  <span className="font-medium">{r.freelancer_name}</span>
                  <span className="text-text-secondary"> · {r.applicant_name} · </span>
                  <span className="tabular-nums">{inr(r.owed_inr)}</span>
                </>
              )}
            />
            {batch.finished && batch.counts.failed + batch.counts.skipped > 0 && (
              <p className="text-body-sm text-text-secondary">
                Payouts marked Failed or Not sent were not recorded. Record those one at a time.
              </p>
            )}
          </>
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
              error={paidOnError}
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

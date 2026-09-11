import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useRecordFreelancerPayout } from '@/queries/freelancerReferrals'
import type { FreelancerReferral } from '@/queries/freelancerReferrals'
import { localDateISO } from '@/lib/time'
import { showToast } from '@/lib/toast'

function inr(n: number | undefined | null): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

/** Records one payout against one referral — money moves outside the platform; this just records that it happened. */
export function RecordPayoutModal({ referral, onClose }: { referral: FreelancerReferral; onClose: () => void }) {
  const recordPayout = useRecordFreelancerPayout()
  const owed = referral.owed_inr ?? 0
  const [amount, setAmount] = useState(String(owed))
  const [paidOn, setPaidOn] = useState(localDateISO())
  const [reference, setReference] = useState('')

  const amountValue = Number(amount)
  const valid = amountValue >= 1 && amountValue <= owed && Boolean(paidOn)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    recordPayout.mutate(
      { referralId: referral.id, amount_inr: amountValue, paid_on: paidOn, reference: reference || undefined },
      {
        onSuccess: () => {
          showToast(`Payout recorded for ${referral.applicant_name}`)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={`Record payout — ${referral.applicant_name}`}
      widthRem={28}
      footer={
        <>
          {recordPayout.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{recordPayout.error.message}</p>
          )}
          <Button type="submit" form="record-payout-form" loading={recordPayout.isPending} disabled={!valid}>
            Record payout
          </Button>
        </>
      }
    >
      <form id="record-payout-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <div className="rounded-md border border-border bg-background p-md text-body-sm text-text-secondary">
          immiNow collected {inr(referral.collected_inr)} on this case; {referral.freelancer_name ? `${referral.freelancer_name}’s` : 'their'} share is{' '}
          {referral.rate_percent ?? 0}% = {inr(referral.earned_inr)}; {inr(referral.paid_inr)} already paid.
        </div>
        <TextField
          label="Amount (₹)"
          type="number"
          min={1}
          max={owed}
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TextField label="Paid on" type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        <TextField
          label="Reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="UPI / bank reference"
        />
      </form>
    </Modal>
  )
}

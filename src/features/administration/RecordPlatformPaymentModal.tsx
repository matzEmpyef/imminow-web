import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useRecordCommissionPayment } from '@/queries/commission'
import type { components } from '@/api/schema'

type CommissionDue = components['schemas']['CommissionDue']

const inr = (m: { amount?: number | null; currency: string } | undefined) =>
  m ? `${(m.amount ?? 0).toLocaleString()} ${m.currency}` : '—'

// Replaces the old standalone "Record a Payment" form (user decision, 2026-08-28): a payment is
// now declared AGAINST one due row, not into an undifferentiated pool. Opened by clicking the
// case's row on the Active Cases tab. Amount starts prefilled with what's actually left on this
// case (due − already declared/confirmed against it, floored at 0) but stays editable — a
// consultant may still want to declare a different amount. No proof upload: "no other proof
// needed", just an optional transaction id for their own reference.
export function RecordPlatformPaymentModal({ due, onClose }: { due: CommissionDue; onClose: () => void }) {
  const recordPayment = useRecordCommissionPayment()
  const remaining = Math.max(
    0,
    (due.platform_due.amount ?? 0) - (due.platform_paid.amount ?? 0) - (due.platform_awaiting.amount ?? 0),
  )
  const [amount, setAmount] = useState(String(remaining))
  const [transactionId, setTransactionId] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount)
    if (!amount || Number.isNaN(value) || value <= 0) return
    recordPayment.mutate(
      { commission_entry_id: due.id, amount: value, transaction_id: transactionId.trim() || null },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Record a Payment"
      widthRem={28}
      footer={
        <>
          {recordPayment.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{recordPayment.error.message}</p>
          )}
          <div className="flex gap-sm">
            <Button
              type="submit"
              form="record-platform-payment-form"
              loading={recordPayment.isPending}
              disabled={!amount || Number(amount) <= 0}
            >
              Declare
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <form id="record-platform-payment-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <div className="rounded-md bg-background p-sm">
          <p className="text-body-sm font-medium text-text-primary">
            {due.applicant_name} · {due.case_type === 'pr' ? 'PR case' : (due.college_name ?? '—')}
          </p>
          <p className="mt-2xs text-caption text-text-secondary">
            Due to immiNow {inr(due.platform_due)}
            {(due.platform_paid.amount ?? 0) > 0 ? ` · ${inr(due.platform_paid)} paid` : ''}
            {(due.platform_awaiting.amount ?? 0) > 0 ? ` · ${inr(due.platform_awaiting)} awaiting confirmation` : ''}
          </p>
        </div>
        <TextField
          label="Amount (INR)"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TextField
          label="Transaction ID (optional)"
          value={transactionId}
          onChange={(e) => setTransactionId(e.target.value)}
          placeholder="UTR / UPI reference"
        />
      </form>
    </Modal>
  )
}

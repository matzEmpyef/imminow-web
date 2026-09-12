import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { TextAreaField } from '@/components/TextAreaField'
import { formatDateTime } from '@/lib/time'
import { money } from './money'
import { useCorrectCommissionPayment, type CommissionPayment } from '@/queries/commission'
import { showToast } from '@/lib/toast'

const MIN_REASON_LENGTH = 3

function approxInr(amountInr: number | undefined, currency: string | undefined): string | null {
  if (!currency || currency === 'INR' || amountInr == null) return null
  return `≈ ₹${amountInr.toLocaleString('en-IN')}`
}

/**
 * Corrects the amount received on an already-confirmed payment (2026-09-11) — money that bounced,
 * a bank reversal, a figure caught wrong after the fact. The old figure moves onto the payment's
 * `corrections` with who and why; the consultancy is shown the reason. Entering ₹0 records that
 * nothing actually arrived — Confirm itself now requires a positive amount, so this is the only
 * way a confirmed payment ends up recording zero.
 */
export function CorrectPaymentModal({ payment, onClose }: { payment: CommissionPayment; onClose: () => void }) {
  const correct = useCorrectCommissionPayment()
  const currentAmount = payment.amount.amount ?? 0
  const currency = payment.amount.currency ?? 'INR'
  const [amount, setAmount] = useState(String(currentAmount))
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)

  const parsed = Number(amount)
  const isValidNumber = amount.trim() !== '' && Number.isFinite(parsed)
  const trimmedReason = reason.trim()
  const invalid = !isValidNumber || parsed < 0 || parsed === currentAmount || trimmedReason.length < MIN_REASON_LENGTH
  const corrections = payment.corrections ?? []

  const amountError = !attempted
    ? undefined
    : !isValidNumber
      ? 'Enter an amount.'
      : parsed < 0
        ? 'Amount can’t be negative.'
        : parsed === currentAmount
          ? 'That’s the amount already on record — change it or cancel.'
          : undefined
  const reasonError = attempted && trimmedReason.length < MIN_REASON_LENGTH ? 'Add a reason (at least 3 characters).' : undefined

  // /commission/payments/{id}/correct has no allow_overpayment flag either (see the note in
  // ConfirmPaymentModal) — informational only, already gated by the required reason above.
  // `entry_outstanding_inr` already has the CURRENT confirmed amount subtracted out (this payment
  // is already confirmed), so what matters is only the extra the correction adds on top of that —
  // not the corrected total against outstanding.
  const currentRateToInr = currency !== 'INR' && currentAmount > 0 ? (payment.amount_inr ?? 0) / currentAmount : 1
  const deltaInr = isValidNumber ? (parsed - currentAmount) * currentRateToInr : null
  const overpaymentInr =
    deltaInr != null && payment.entry_outstanding_inr != null && deltaInr > payment.entry_outstanding_inr
      ? deltaInr - payment.entry_outstanding_inr
      : 0

  return (
    <Modal
      onClose={onClose}
      title="Correct amount received"
      widthRem={30}
      footer={
        <>
          {correct.isError && <p className="mr-auto self-center text-body-sm text-error">{correct.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={correct.isPending}
            onClick={() => {
              if (invalid) {
                setAttempted(true)
                return
              }
              correct.mutate(
                { paymentId: payment.id, amount: parsed, reason: trimmedReason },
                {
                  onSuccess: () => {
                    showToast(`Amount corrected for ${payment.consultancy_name ?? 'this payment'}`)
                    onClose()
                  },
                },
              )
            }}
          >
            Save correction
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <div className="rounded-md border border-border bg-background p-md">
          <div className="flex items-center justify-between">
            <span className="text-caption text-text-secondary">Currently received</span>
            <span className="flex flex-col items-end">
              <span className="text-body font-medium text-text-primary">{money(payment.amount)}</span>
              {approxInr(payment.amount_inr, currency) && (
                <span className="text-caption text-text-secondary">{approxInr(payment.amount_inr, currency)}</span>
              )}
            </span>
          </div>
          {payment.declared_amount && (
            <div className="flex items-center justify-between">
              <span className="text-caption text-text-secondary">Declared amount</span>
              <span className="text-body-sm text-text-primary">{money(payment.declared_amount)}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-caption text-text-secondary">Consultancy</span>
            <span className="text-body-sm text-text-primary">{payment.consultancy_name ?? 'Unknown'}</span>
          </div>
        </div>

        <TextField
          label={`New amount received (${currency})`}
          type="number"
          min={0}
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={amountError}
        />
        {overpaymentInr > 0 && (
          <p className="text-body-sm text-warning">
            That&rsquo;s {currency === 'INR' ? '' : '~'}
            {money({ amount: overpaymentInr, currency: 'INR' })} more than this case still owes.
          </p>
        )}
        <TextAreaField
          label="Reason"
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="The consultancy is shown this reason."
          error={reasonError}
        />
        <p className="text-caption text-text-secondary">Entering ₹0 records that the money bounced.</p>

        {corrections.length > 0 && (
          <div>
            <h3 className="text-body-sm font-medium text-text-primary">Previous corrections</h3>
            <div className="mt-xs flex flex-col gap-xs">
              {corrections.map((c) => (
                <div key={c.id} className="rounded-md border border-border px-sm py-xs">
                  <p className="text-body-sm text-text-primary">
                    {money({ amount: c.from_amount, currency })} &rarr; {money({ amount: c.to_amount, currency })}
                  </p>
                  <p className="text-caption text-text-secondary">{c.reason}</p>
                  <p className="text-caption text-text-secondary">
                    {c.corrected_by_name ?? 'Unknown'} · {c.corrected_at ? formatDateTime(c.corrected_at) : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

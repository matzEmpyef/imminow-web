import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { TextAreaField } from '@/components/TextAreaField'
import { money } from './money'
import { useConfirmCommissionPayment, type CommissionPayment } from '@/queries/commission'
import { showToast } from '@/lib/toast'

const MIN_REASON_LENGTH = 3

function inr(n: number | null | undefined): string {
  return n == null ? '—' : `₹${n.toLocaleString('en-IN')}`
}

/**
 * The declared → confirmed step (2026-09-11 rebuild, single-payment path — see BulkConfirmModal
 * for the multi-select one, which always confirms the declared amount as-is). "Amount received"
 * is prefilled with what the consultancy declared but editable: Finance can record a different
 * figure right here instead of confirming the wrong amount and correcting it after the fact. A
 * difference needs a reason — the consultancy is shown it, same as a rejection reason.
 */
function approxInr(amountInr: number | undefined, currency: string | undefined): string | null {
  if (!currency || currency === 'INR' || amountInr == null) return null
  return `≈ ₹${amountInr.toLocaleString('en-IN')}`
}

export function ConfirmPaymentModal({ payment, onClose }: { payment: CommissionPayment; onClose: () => void }) {
  const confirm = useConfirmCommissionPayment()
  const declaredAmount = payment.amount.amount ?? 0
  const currency = payment.amount.currency ?? 'INR'
  const [receivedAmount, setReceivedAmount] = useState(String(declaredAmount))
  const [note, setNote] = useState('')

  const parsed = Number(receivedAmount)
  const isValidNumber = receivedAmount.trim() !== '' && Number.isFinite(parsed)
  const differs = isValidNumber && parsed !== declaredAmount
  const trimmedNote = note.trim()
  const invalid = !isValidNumber || parsed <= 0 || (differs && trimmedNote.length < MIN_REASON_LENGTH)

  // /commission/payments/{id}/confirm has no allow_overpayment flag (unlike /commission-
  // entries/{id}/receive — review C5, 2026-09-12) — a "received more than what's still owed" case
  // here is only ever a corrected figure, already gated by the reason field above. This is an
  // informational heads-up, not a second gate: the case's own outstanding is tracked in INR while
  // the amount received is entered in its own currency, so a non-INR figure is converted at the
  // same rate `amount_inr` was fixed at (approximate, same "≈" convention as approxInr above).
  const declaredRateToInr = currency !== 'INR' && declaredAmount > 0 ? (payment.amount_inr ?? 0) / declaredAmount : 1
  const receivedInr = isValidNumber ? parsed * declaredRateToInr : null
  const overpaymentInr =
    receivedInr != null && payment.entry_outstanding_inr != null && receivedInr > payment.entry_outstanding_inr
      ? receivedInr - payment.entry_outstanding_inr
      : 0

  return (
    <Modal
      onClose={onClose}
      title="Confirm payment received"
      widthRem={28}
      footer={
        <>
          {confirm.isError && <p className="mr-auto self-center text-body-sm text-error">{confirm.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={confirm.isPending}
            disabled={invalid}
            onClick={() =>
              confirm.mutate(
                {
                  paymentId: payment.id,
                  receivedAmount: parsed,
                  note: differs ? trimmedNote : undefined,
                },
                {
                  onSuccess: () => {
                    showToast('Payment confirmed')
                    onClose()
                  },
                },
              )
            }
          >
            Confirm received
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <div className="rounded-md border border-border bg-background p-md">
          <div className="flex items-center justify-between">
            <span className="text-caption text-text-secondary">Declared amount</span>
            <span className="flex flex-col items-end">
              <span className="text-body font-medium text-text-primary">{money(payment.amount)}</span>
              {approxInr(payment.amount_inr, currency) && (
                <span className="text-caption text-text-secondary">{approxInr(payment.amount_inr, currency)}</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-caption text-text-secondary">Case still owes</span>
            <span className="text-body-sm text-text-primary">{inr(payment.entry_outstanding_inr)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-caption text-text-secondary">Consultancy</span>
            <span className="text-body-sm text-text-primary">{payment.consultancy_name ?? 'Unknown'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-caption text-text-secondary">Reference</span>
            <span className="text-body-sm text-text-primary">{payment.transaction_id ?? '—'}</span>
          </div>
        </div>

        <TextField
          label={`Amount received (${currency})`}
          type="number"
          min={0}
          required
          value={receivedAmount}
          onChange={(e) => setReceivedAmount(e.target.value)}
        />

        {overpaymentInr > 0 && (
          <p className="text-body-sm text-warning">
            That&rsquo;s {currency === 'INR' ? '' : '~'}
            {inr(overpaymentInr)} more than this case still owes.
          </p>
        )}

        {differs && (
          <>
            <TextAreaField
              label="Why is it different?"
              required
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              hint="The consultancy is shown this."
            />
            <p className="text-body-sm text-text-secondary">
              Declared {money({ amount: declaredAmount, currency })} · Received{' '}
              {isValidNumber ? money({ amount: parsed, currency }) : '—'} · Difference{' '}
              {isValidNumber ? money({ amount: Math.abs(parsed - declaredAmount), currency }) : '—'}
            </p>
          </>
        )}

        <p className="text-body-sm text-text-secondary">
          Only confirm once the money is in immiNow&rsquo;s account. You can correct the amount later from History.
        </p>
      </div>
    </Modal>
  )
}

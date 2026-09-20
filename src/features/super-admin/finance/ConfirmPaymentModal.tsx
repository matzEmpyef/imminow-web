import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { TextAreaField } from '@/components/TextAreaField'
import { money, paymentInrNote, paymentMoney } from './money'
import { useConfirmCommissionPayment, type CommissionPayment } from '@/queries/commission'
import { showToast } from '@/lib/toast'

const MIN_REASON_LENGTH = 3

/**
 * The declared → confirmed step (2026-09-11 rebuild, single-payment path — see BulkConfirmModal
 * for the multi-select one, which always confirms the declared amount as-is). "Amount received"
 * is prefilled with what the consultancy declared but editable: Finance can record a different
 * figure right here instead of confirming the wrong amount and correcting it after the fact. A
 * difference needs a reason — the consultancy is shown it, same as a rejection reason.
 */
/**
 * The ≈ ₹ figure for a due's OUTSTANDING balance — a running total, not a settled payment, so it
 * carries no frozen rate of its own. A payment's own ≈ figure comes from `paymentInrNote`, which
 * shows the rate it was valued at (assumptions audit M15, product owner 2026-09-19).
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
  // informational heads-up, not a second gate.
  //
  // Compared like with like against the server's `entry_outstanding`, which is in THIS payment's
  // own currency (assumptions audit H14, approved 2026-09-19). The client used to derive an FX
  // rate as `amount_inr / declared` and compare rupees: with `amount_inr` missing the rate came
  // out 0, so CAD 8,000 confirmed against CAD 500 owed warned about nothing at all. No rate is
  // computed here any more — when the server cannot say what is outstanding, the screen says so
  // rather than staying quiet.
  const outstanding = payment.entry_outstanding
  const outstandingAmount =
    outstanding?.amount != null && (outstanding.currency ?? currency) === currency ? outstanding.amount : null
  const overpayment =
    isValidNumber && outstandingAmount != null && parsed > outstandingAmount ? parsed - outstandingAmount : 0

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
              <span className="text-body font-medium text-text-primary">{paymentMoney(payment)}</span>
              {/* The rate this was VALUED at, stored on the row (assumptions audit M15). */}
              {paymentInrNote(payment) && (
                <span className="text-caption text-text-secondary">{paymentInrNote(payment)}</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-caption text-text-secondary">Case still owes</span>
            <span className="flex flex-col items-end">
              <span className="text-body-sm text-text-primary">
                {outstandingAmount != null ? money({ amount: outstandingAmount, currency }) : 'Not known'}
              </span>
              {approxInr(payment.entry_outstanding_inr ?? undefined, currency) && (
                <span className="text-caption text-text-secondary">
                  {approxInr(payment.entry_outstanding_inr ?? undefined, currency)}
                </span>
              )}
            </span>
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

        {overpayment > 0 && (
          <p className="text-body-sm text-warning">
            That&rsquo;s {money({ amount: overpayment, currency })} more than this case still owes.
          </p>
        )}
        {outstandingAmount == null && (
          <p className="text-body-sm text-text-secondary">
            This case&rsquo;s outstanding amount is unknown, so nothing here can tell you whether this is more than is
            owed — check the case before confirming.
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

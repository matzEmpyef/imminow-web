import { hasTooManyDecimals, serverMoneyMessage } from '@/lib/moneyInput'
import { MoneyField } from '@/components/MoneyField'
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { formatDateTime } from '@/lib/time'
import { money, paymentInrNote, paymentMoney, paymentRateToInr } from './money'
import { useCorrectCommissionPayment, type CommissionPayment } from '@/queries/commission'
import { showToast } from '@/lib/toast'
import { ApiError } from '@/api/errors'

const MIN_REASON_LENGTH = 3

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
  const invalid =
    !isValidNumber ||
    parsed < 0 ||
    hasTooManyDecimals(amount) ||
    parsed === currentAmount ||
    trimmedReason.length < MIN_REASON_LENGTH
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

  // An early, informational note worked out from what the list already holds. The decision is the
  // server's (below): it holds a correction upwards to what is still unpaid on the case.
  // `entry_outstanding_inr` already has the CURRENT confirmed amount subtracted out (this payment
  // is already confirmed), so what matters is only the extra the correction adds on top of that —
  // not the corrected total against outstanding.
  // The rate is the payment's own recorded one (review F-300), not worked out from two amounts.
  const currentRateToInr = paymentRateToInr(payment)
  const deltaInr = isValidNumber && currentRateToInr != null ? (parsed - currentAmount) * currentRateToInr : null
  const overpaymentInr =
    deltaInr != null && payment.entry_outstanding_inr != null && deltaInr > payment.entry_outstanding_inr
      ? deltaInr - payment.entry_outstanding_inr
      : 0

  // The server's refusal of a correction upwards past what is still unpaid (409
  // `more_than_outstanding`, review F-227): its sentence is shown with the same "record it anyway"
  // tick the receive dialog offers, and the correction is then sent with `allow_overpayment`.
  const [allowOverpayment, setAllowOverpayment] = useState(false)
  const refusal = correct.error instanceof ApiError ? correct.error : null
  // The server's own sentence for the amount, when it refused it (`details.fields`).
  const amountMessage = serverMoneyMessage(correct.error, 'amount', 'received_amount')
  const serverSaysOverpayment = refusal?.code === 'more_than_outstanding'

  // The refusal was about the amount as it was sent: once it changes, neither it nor the tick applies.
  function clearServerOverpayment() {
    if (!serverSaysOverpayment) return
    correct.reset()
    setAllowOverpayment(false)
  }

  return (
    <Modal
      onClose={onClose}
      title="Correct amount received"
      widthRem={30}
      footer={
        <>
          {correct.isError && !serverSaysOverpayment && !amountMessage && (
            <p className="mr-auto self-center text-body-sm text-error">{correct.error.message}</p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={correct.isPending}
            disabled={serverSaysOverpayment && !allowOverpayment}
            onClick={() => {
              if (invalid) {
                setAttempted(true)
                return
              }
              correct.mutate(
                {
                  paymentId: payment.id,
                  amount: parsed,
                  reason: trimmedReason,
                  allow_overpayment: serverSaysOverpayment ? allowOverpayment : undefined,
                },
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
              <span className="text-body font-medium text-text-primary">{paymentMoney(payment)}</span>
              {paymentInrNote(payment) && (
                <span className="text-caption text-text-secondary">{paymentInrNote(payment)}</span>
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

        <MoneyField
          label={`New amount received (${currency})`}
          min={0}
          required
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
            clearServerOverpayment()
          }}
          error={amountError ?? amountMessage}
        />
        {serverSaysOverpayment && (
          <div role="alert" className="flex flex-col gap-sm rounded-md border border-warning bg-warning-subtle p-sm">
            <p className="text-body-sm text-text-primary">{refusal?.message}</p>
            <label className="flex items-center gap-sm text-body-sm text-text-primary">
              <input
                type="checkbox"
                checked={allowOverpayment}
                onChange={(e) => setAllowOverpayment(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              It is an over-payment — record it anyway
            </label>
          </div>
        )}
        {!serverSaysOverpayment && overpaymentInr > 0 && (
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

import { serverMoneyMessage } from '@/lib/moneyInput'
import { MoneyField } from '@/components/MoneyField'
import { useState } from 'react'
import { useDebouncedValue } from '@/lib/useDebounce'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { formatDateTime } from '@/lib/time'
import { money, paymentInrNote, paymentMoney } from './money'
import { useCorrectCommissionPayment, useCorrectPreview, type CommissionPayment } from '@/queries/commission'
import { showToast } from '@/lib/toast'
import { ApiError } from '@/api/errors'
import { StillNeeded } from '@/components/StillNeeded'
import { isTextOk, moneyError } from '@/lib/validation'

/**
 * Corrects the amount received on an already-confirmed payment (2026-09-11) — money that bounced,
 * a bank reversal, a figure caught wrong after the fact. The old figure moves onto the payment's
 * `corrections` with who and why; the consultancy is shown the reason. Entering 0 records that
 * nothing actually arrived — Confirm itself now requires a positive amount, so this is the only
 * way a confirmed payment ends up recording zero.
 *
 * NOTHING IS WORKED OUT HERE (review F-300, 2026-10-10). After a short pause in typing, the new
 * amount goes to `POST /commission/payments/{id}/correct/preview` (nothing is written) and the
 * dialog shows what comes back: the change and its direction, and whether the increase is more
 * than is still unpaid on the case, by how much, and what that is in rupees. The figures belong to
 * the amount they were asked for and are never shown for another one; a refusal from the preview
 * shows the server's sentence and does not stop the typing.
 */
export function CorrectPaymentModal({ payment, onClose }: { payment: CommissionPayment; onClose: () => void }) {
  const correct = useCorrectCommissionPayment()
  const currentAmount = payment.amount.amount ?? 0
  const currency = payment.amount.currency ?? 'INR'
  const [amount, setAmount] = useState(String(currentAmount))
  const [reason, setReason] = useState('')

  const parsed = Number(amount)
  // Zero is allowed here: it records that nothing actually arrived. The rest is the field's own rule.
  const isValidNumber =
    amount.trim() !== '' && Number.isFinite(parsed) && moneyError(amount, { allowZero: true }) === undefined
  const trimmedReason = reason.trim()
  const unchanged = isValidNumber && parsed === currentAmount
  const corrections = payment.corrections ?? []

  // The corrected amount as it would be sent, asked of the server after a short pause in typing;
  // none goes while it is not a valid amount, or is the amount already on record.
  const asked = isValidNumber && parsed !== currentAmount ? parsed : null
  const settled = useDebouncedValue(asked)
  const preview = useCorrectPreview(payment.id, settled ?? undefined, settled != null)
  const draftSettled = asked != null && settled === asked
  // The figures belong to the amount they were asked for: not shown while it has moved on.
  const previewCurrent = draftSettled && !preview.isFetching ? preview.data : undefined
  const previewRefusal = draftSettled && preview.error instanceof ApiError ? preview.error : null
  const isOverpayment = previewCurrent?.is_overpayment === true

  // A correction upwards past what is still unpaid (review F-227): the preview says so first, and the
  // server's own refusal (409 `more_than_outstanding`) is the same thing said later. Either way the
  // tick the receive dialog offers is the answer, and the correction is then sent with `allow_overpayment`.
  const [allowOverpayment, setAllowOverpayment] = useState(false)
  const refusal = correct.error instanceof ApiError ? correct.error : null
  // The server's own sentence for the amount, when it refused it (`details.fields`).
  const amountMessage = serverMoneyMessage(correct.error, 'amount', 'received_amount')
  const serverSaysOverpayment = refusal?.code === 'more_than_outstanding'
  const overpaymentShown = isOverpayment || serverSaysOverpayment

  const stillNeeded = [
    ...(!isValidNumber ? ['the new amount'] : unchanged ? ['a different amount from the one on record'] : []),
    ...(isTextOk('reason', reason) ? [] : ['the reason']),
    ...(overpaymentShown && !allowOverpayment ? ['the over-payment tick'] : []),
  ]
  const invalid = stillNeeded.length > 0

  // The refusal was about the amount as it was sent: once it changes, neither it nor the tick applies.
  function clearServerOverpayment() {
    setAllowOverpayment(false)
    if (serverSaysOverpayment) correct.reset()
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
          <StillNeeded items={stillNeeded} />
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={correct.isPending}
            disabled={invalid}
            onClick={() => {
              correct.mutate(
                {
                  paymentId: payment.id,
                  amount: parsed,
                  reason: trimmedReason,
                  allow_overpayment: overpaymentShown ? allowOverpayment : undefined,
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
          required
          allowZero
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
            clearServerOverpayment()
            if (amountMessage) correct.reset()
          }}
          error={amountMessage}
        />
        {previewCurrent && !overpaymentShown && (
          <p className="text-caption text-text-secondary">
            Change: {money(previewCurrent.change)} ({previewCurrent.change_direction} than now).
          </p>
        )}
        {previewRefusal && !overpaymentShown && (
          <p role="status" className="text-caption text-text-secondary">
            {previewRefusal.message}
          </p>
        )}
        {overpaymentShown && (
          <div role="alert" className="flex flex-col gap-sm rounded-md border border-warning bg-warning-subtle p-sm">
            <p className="text-body-sm text-text-primary">
              {serverSaysOverpayment ? (
                refusal?.message
              ) : (
                <>
                  That&rsquo;s {money(previewCurrent?.overpaid_by)}
                  {previewCurrent?.overpaid_by_inr && currency !== 'INR' ? ` (≈ ${money(previewCurrent.overpaid_by_inr)})` : ''} more than
                  this case can still receive ({money(previewCurrent?.outstanding)}).
                </>
              )}
            </p>
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
        <TextAreaField
          kind="reason"
          label="Reason"
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="The consultancy or institute is shown this reason."
        />
        <p className="text-caption text-text-secondary">Enter 0 if no money arrived, for example when a cheque bounced.</p>

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

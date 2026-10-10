import { hasTooManyDecimals, serverMoneyMessage } from '@/lib/moneyInput'
import { MoneyField } from '@/components/MoneyField'
import { formatAmountOnly } from '@/lib/money'
import { useState } from 'react'
import { ApiError } from '@/api/errors'
import { useDebouncedValue } from '@/lib/useDebounce'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { money, paymentInrNote, paymentMoney } from './money'
import { useConfirmCommissionPayment, useConfirmPreview, type CommissionPayment } from '@/queries/commission'
import { showToast } from '@/lib/toast'

const MIN_REASON_LENGTH = 3

/**
 * The ≈ ₹ figure for a due's OUTSTANDING balance — a running total, not a settled payment, so it
 * carries no frozen rate of its own. A payment's own ≈ figure comes from `paymentInrNote`, which
 * shows the rate it was valued at (assumptions audit M15, product owner 2026-09-19).
 */
function approxInr(amountInr: number | undefined, currency: string | undefined): string | null {
  if (!currency || currency === 'INR' || amountInr == null) return null
  return `≈ ₹${formatAmountOnly('INR', amountInr)}`
}

/**
 * The declared → confirmed step (2026-09-11 rebuild, single-payment path — see BulkConfirmModal
 * for the multi-select one, which always confirms the declared amount as-is). "Amount received"
 * is prefilled with what the consultancy declared but editable: Finance can record a different
 * figure right here instead of confirming the wrong amount and correcting it after the fact. A
 * difference needs a reason — the consultancy is shown it, same as a rejection reason.
 *
 * NOTHING IS WORKED OUT HERE (review F-300, 2026-10-10). After a short pause in typing, the amount
 * goes to `POST /commission/payments/{id}/confirm/preview` (nothing is written) and the dialog
 * shows what comes back: whether it differs from the declaration, whether that needs a note, the
 * difference, whether it is more than the case still owes and by how much, and the rupee value at
 * the rate the confirmation would freeze. The figures belong to the amount they were asked for and
 * are never shown for another one; a refusal from the preview shows the server's sentence and does
 * not stop the typing.
 */
export function ConfirmPaymentModal({ payment, onClose }: { payment: CommissionPayment; onClose: () => void }) {
  const confirm = useConfirmCommissionPayment()
  const declaredAmount = payment.amount.amount ?? 0
  const currency = payment.amount.currency ?? 'INR'
  const [receivedAmount, setReceivedAmount] = useState(String(declaredAmount))
  const [note, setNote] = useState('')

  const parsed = Number(receivedAmount)
  const isValidAmount =
    receivedAmount.trim() !== '' && Number.isFinite(parsed) && parsed > 0 && !hasTooManyDecimals(receivedAmount)
  const trimmedNote = note.trim()
  // The server's own sentence for the amount, when it refused it (`details.fields`).
  const amountMessage = serverMoneyMessage(confirm.error, 'received_amount', 'amount')

  // The amount as it would be confirmed, asked of the server after a short pause in typing; none
  // goes while it is not a valid amount.
  const asked = isValidAmount ? parsed : null
  const settled = useDebouncedValue(asked)
  const preview = useConfirmPreview(payment.id, settled ?? undefined, settled != null)
  const draftSettled = asked != null && settled === asked
  // The figures belong to the amount they were asked for: not shown while it has moved on.
  const previewCurrent = draftSettled && !preview.isFetching ? preview.data : undefined
  const previewRefusal = draftSettled && preview.error instanceof ApiError ? preview.error : null
  const awaitingPreview = isValidAmount && !previewCurrent && !previewRefusal

  const differs = previewCurrent?.differs === true
  const needsNote = previewCurrent?.needs_note === true
  const isOverpayment = previewCurrent?.is_overpayment === true

  // The server's refusal of an amount above what the case still owes (409 `more_than_outstanding`
  // — the preview normally says so first): its sentence is shown with the same "record it anyway"
  // tick, and the confirmation is then sent with `allow_overpayment: true`.
  const [allowOverpayment, setAllowOverpayment] = useState(false)
  const refusal = confirm.error instanceof ApiError ? confirm.error : null
  const serverSaysOverpayment = refusal?.code === 'more_than_outstanding'
  const overpaymentShown = isOverpayment || serverSaysOverpayment

  const invalid =
    !isValidAmount ||
    awaitingPreview ||
    (needsNote && trimmedNote.length < MIN_REASON_LENGTH) ||
    (overpaymentShown && !allowOverpayment)

  // What the case still owes: the server's figure for this confirmation, else the one the list holds
  // (in this payment's own currency, assumptions audit H14).
  const outstanding = payment.entry_outstanding
  const listedOwes =
    outstanding?.amount != null && (outstanding.currency ?? currency) === currency
      ? { amount: outstanding.amount, currency }
      : null
  const owes = previewCurrent?.outstanding ?? listedOwes

  function changeAmount(value: string) {
    setReceivedAmount(value)
    // The tick and the server's refusal were about the amount as it was sent.
    setAllowOverpayment(false)
    if (serverSaysOverpayment || amountMessage) confirm.reset()
  }

  return (
    <Modal
      onClose={onClose}
      title="Confirm payment received"
      widthRem={28}
      footer={
        <>
          {confirm.isError && !amountMessage && !serverSaysOverpayment && (
            <p className="mr-auto self-center text-body-sm text-error">{confirm.error.message}</p>
          )}
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
                  note: needsNote ? trimmedNote : undefined,
                  allow_overpayment: overpaymentShown ? allowOverpayment : undefined,
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
                {owes ? money(owes) : 'Not known'}
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

        <MoneyField
          label={`Amount received (${currency})`}
          min={0}
          required
          value={receivedAmount}
          onChange={(e) => changeAmount(e.target.value)}
          error={amountMessage}
        />

        {previewCurrent?.received_amount_inr && previewCurrent.currency !== 'INR' && (
          <p className="text-caption text-text-secondary">
            ≈ {money(previewCurrent.received_amount_inr)}
            {previewCurrent.rate != null && <> at {previewCurrent.rate}</>}
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
                  That&rsquo;s {money(previewCurrent?.overpaid_by)} more than this case still owes (
                  {money(previewCurrent?.outstanding)}).
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

        {needsNote && (
          <TextAreaField
            label="Why is it different?"
            required
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            hint="The consultancy is shown this."
          />
        )}
        {differs && previewCurrent && (
          <p className="text-body-sm text-text-secondary">
            Declared {money(previewCurrent.declared_amount)} · Received {money(previewCurrent.received_amount)} ·{' '}
            {previewCurrent.difference_direction === 'same'
              ? 'No difference'
              : `Difference ${money(previewCurrent.difference_from_declared)} (${previewCurrent.difference_direction} than declared)`}
          </p>
        )}

        <p className="text-body-sm text-text-secondary">
          Only confirm once the money is in immiNow&rsquo;s account. You can correct the amount later from History.
        </p>
      </div>
    </Modal>
  )
}

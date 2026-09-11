import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { TextAreaField } from '@/components/TextAreaField'
import { money } from './money'
import { useConfirmCommissionPayment, type CommissionPayment } from '@/queries/commission'

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
export function ConfirmPaymentModal({ payment, onClose }: { payment: CommissionPayment; onClose: () => void }) {
  const confirm = useConfirmCommissionPayment()
  const declaredAmount = payment.amount.amount ?? 0
  const [receivedAmount, setReceivedAmount] = useState(String(declaredAmount))
  const [note, setNote] = useState('')

  const parsed = Number(receivedAmount)
  const isValidNumber = receivedAmount.trim() !== '' && Number.isFinite(parsed)
  const differs = isValidNumber && parsed !== declaredAmount
  const trimmedNote = note.trim()
  const invalid = !isValidNumber || parsed <= 0 || (differs && trimmedNote.length < MIN_REASON_LENGTH)

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
                { onSuccess: onClose },
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
            <span className="text-body font-medium text-text-primary">{money(payment.amount)}</span>
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
          label="Amount received (₹)"
          type="number"
          min={0}
          required
          value={receivedAmount}
          onChange={(e) => setReceivedAmount(e.target.value)}
        />

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
              Declared {inr(declaredAmount)} · Received {isValidNumber ? inr(parsed) : '—'} · Difference{' '}
              {isValidNumber ? inr(Math.abs(parsed - declaredAmount)) : '—'}
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

import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { useVoidInstallment } from '@/queries/commissionEntries'
import { formatDate } from '@/lib/time'
import { formatMoneyAmount } from '@/lib/money'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'
import { ALREADY_APPLIED_NOTICE, isAlreadyApplied, usePayloadIdempotencyKey } from '@/lib/useIdempotencyKey'

const MIN_REASON_LENGTH = 3

/**
 * Voids a mis-entered installment (contract gate 11, F14). It replaces the old one-click Remove:
 * the row is never deleted — it stays in the record marked void with the reason and who voided it —
 * so a reason is mandatory. The server refuses with `part_settled` when a payment is already
 * allocated against the installment's share part; that message is shown here as-is. So is the 409
 * `conflict` for a void that is already waiting for immiNow Finance (review F-078).
 *
 * WHETHER IT IS A REQUEST IS THE SERVER'S ANSWER, never assumed here: a share already due, or a
 * Finance override in force on the case (since 2026-10-10, the share has only stepped aside for
 * the override and comes back when it is removed), makes the void a request that waits for
 * Finance. The answer carries `void_requested_at` with `voided_at` empty, and the message below
 * follows it.
 */
export function VoidInstallmentModal({
  clientId,
  entryId,
  installment,
  onClose,
}: {
  clientId: string
  entryId: string
  installment: components['schemas']['CommissionInstallment']
  onClose: () => void
}) {
  const voidInstallment = useVoidInstallment(clientId)
  const [reason, setReason] = useState('')
  const { keyFor, settle } = usePayloadIdempotencyKey()
  const trimmed = reason.trim()

  function submit() {
    if (trimmed.length < MIN_REASON_LENGTH || voidInstallment.isPending) return
    const payload = { entryId, installmentId: installment.id, reason: trimmed }
    voidInstallment.mutate(
      { ...payload, idempotencyKey: keyFor(payload) },
      {
        onError: (err) => {
          settle(err)
          // Already recorded (the first answer was lost): the write is done. Close, say so, never resubmit.
          if (isAlreadyApplied(err)) {
            showToast(ALREADY_APPLIED_NOTICE)
            onClose()
          }
        },
        onSuccess: (result) => {
          // The share of this installment is already due (review F-078): the server kept the
          // installment and passed the void to immiNow Finance. The row now reads "Waiting for
          // immiNow Finance" with this reason.
          const waiting = !result?.voided_at && Boolean(result?.void_requested_at)
          showToast(waiting ? 'Void sent to immiNow Finance for approval' : 'Installment voided')
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={`Void installment — ${formatMoneyAmount(installment.amount)}`}
      widthRem={28}
      footer={
        <>
          {voidInstallment.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{voidInstallment.error.message}</p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={voidInstallment.isPending}
            disabled={trimmed.length < MIN_REASON_LENGTH}
            onClick={submit}
          >
            Void installment
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          {formatMoneyAmount(installment.amount)} received from {installment.source === 'student' ? 'the applicant' : 'the college'} on{' '}
          {formatDate(installment.received_on)}. Voiding keeps the row on record, marked void, and takes the amount out of
          what has been received.
        </p>
        {/* Not promised as immediate: whether it is a request is the server's call (the share is
            already due, or Finance has set its own amount for the case), and its answer decides
            what the row reads afterwards. */}
        <p className="text-body-sm text-text-secondary">
          If immiNow&rsquo;s share of this case is already due, or immiNow Finance has set its own amount for the case,
          this is sent to immiNow Finance as a request instead. The installment stays as it is until they answer.
        </p>
        <TextAreaField
          label="Reason"
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="Kept on the audit record, e.g. “entered against the wrong source”."
        />
      </div>
    </Modal>
  )
}

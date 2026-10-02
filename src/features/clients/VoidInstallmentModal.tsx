import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { useVoidInstallment } from '@/queries/commissionEntries'
import { formatDate } from '@/lib/time'
import { formatMoneyAmount } from '@/lib/money'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'

const MIN_REASON_LENGTH = 3

/**
 * Voids a mis-entered installment (contract gate 11, F14). It replaces the old one-click Remove:
 * the row is never deleted — it stays in the record marked void with the reason and who voided it —
 * so a reason is mandatory. The server refuses with `part_settled` when a payment is already
 * allocated against the installment's share part; that message is shown here as-is.
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
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const trimmed = reason.trim()

  function submit() {
    if (trimmed.length < MIN_REASON_LENGTH || voidInstallment.isPending) return
    voidInstallment.mutate(
      { entryId, installmentId: installment.id, reason: trimmed, idempotencyKey },
      {
        onSuccess: () => {
          showToast('Installment voided')
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

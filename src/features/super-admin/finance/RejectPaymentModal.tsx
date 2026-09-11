import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { formatMoneyAmount } from '@/lib/money'
import { useRejectCommissionPayment, type CommissionPayment } from '@/queries/commission'

const money = formatMoneyAmount
const MIN_REASON_LENGTH = 3

/** Turns a declared payment down with a reason the consultancy is shown (2026-09-11 rebuild). */
export function RejectPaymentModal({ payment, onClose }: { payment: CommissionPayment; onClose: () => void }) {
  const reject = useRejectCommissionPayment()
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()

  return (
    <Modal
      onClose={onClose}
      title={`Reject payment — ${money(payment.amount)}`}
      widthRem={28}
      footer={
        <>
          {reject.isError && <p className="mr-auto self-center text-body-sm text-error">{reject.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={reject.isPending}
            disabled={trimmed.length < MIN_REASON_LENGTH}
            onClick={() => reject.mutate({ paymentId: payment.id, reason: trimmed }, { onSuccess: onClose })}
          >
            Reject
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          {payment.consultancy_name ?? 'This consultancy'} declared {money(payment.amount)}
          {payment.applicant_name ? ` for ${payment.applicant_name}` : ''}.
        </p>
        <TextAreaField
          label="Reason"
          required
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="The consultancy is shown this reason and can declare again."
        />
      </div>
    </Modal>
  )
}

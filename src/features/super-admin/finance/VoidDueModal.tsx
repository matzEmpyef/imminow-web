import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { money } from './money'
import { useVoidCommissionDue, type CommissionDuePart, type FinanceCaseRow } from '@/queries/financeDashboard'
import { showToast } from '@/lib/toast'

const MIN_REASON_LENGTH = 3

/** Removes an amount added by mistake (2026-09-11) — it stays visible in the change history, struck through. */
export function VoidDueModal({
  caseRow,
  part,
  onClose,
  onVoided,
}: {
  caseRow: FinanceCaseRow
  part: CommissionDuePart
  onClose: () => void
  onVoided: (row: FinanceCaseRow) => void
}) {
  const voidDue = useVoidCommissionDue()
  const [reason, setReason] = useState('')
  const trimmedReason = reason.trim()
  const invalid = trimmedReason.length < MIN_REASON_LENGTH
  const partAmount = money({ amount: part.amount ?? 0, currency: part.currency ?? 'INR' })

  return (
    <Modal
      onClose={onClose}
      title={`Remove ${partAmount} added amount`}
      widthRem={26}
      footer={
        <>
          {voidDue.isError && <p className="mr-auto self-center text-body-sm text-error">{voidDue.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={voidDue.isPending}
            disabled={invalid || !part.id}
            onClick={() =>
              part.id &&
              voidDue.mutate(
                { entryId: caseRow.id, changeId: part.id, reason: trimmedReason },
                {
                  onSuccess: (row) => {
                    showToast(`Added amount removed for ${caseRow.applicant_name}`)
                    onVoided(row)
                  },
                },
              )
            }
          >
            Remove
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          {part.reason ? `Added for: ${part.reason}` : 'This added amount'} will be removed from what the case owes.
        </p>
        <TextAreaField
          label="Reason"
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="The consultancy is shown this reason."
        />
      </div>
    </Modal>
  )
}

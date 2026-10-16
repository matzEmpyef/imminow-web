import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { money } from './money'
import { useVoidCommissionDue, type CommissionDuePart, type FinanceCaseRow } from '@/queries/financeDashboard'
import { showToast } from '@/lib/toast'
import { REASON_MIN } from '@/lib/validation'

/**
 * Undoes a small-difference settlement (2026-10-08) — the same reason popup as ReopenDueModal, on
 * the same void hook, against the part's `settle_change_id`. The written-off amount goes back to
 * being owed.
 */
export function UndoSettlementModal({
  caseRow,
  part,
  onClose,
  onUndone,
}: {
  caseRow: FinanceCaseRow
  part: CommissionDuePart
  onClose: () => void
  onUndone: (row: FinanceCaseRow) => void
}) {
  const voidDue = useVoidCommissionDue()
  const [reason, setReason] = useState('')
  const trimmedReason = reason.trim()
  const invalid = trimmedReason.length < REASON_MIN || !part.settle_change_id
  const writtenOff = money({ amount: part.written_off, currency: part.currency ?? 'INR' })

  return (
    <Modal
      onClose={onClose}
      title={`Undo ${writtenOff} written off`}
      widthRem={26}
      footer={
        <>
          {voidDue.isError && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {voidDue.error.message}
            </p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={voidDue.isPending}
            disabled={invalid}
            onClick={() =>
              part.settle_change_id &&
              voidDue.mutate(
                { entryId: caseRow.id, changeId: part.settle_change_id, reason: trimmedReason },
                {
                  onSuccess: (row) => {
                    showToast(`Settlement undone for ${caseRow.applicant_name}`)
                    onUndone(row)
                  },
                },
              )
            }
          >
            Undo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          {part.settled_reason ? `Settled for: ${part.settled_reason}. ` : ''}The written-off amount will count toward
          what&rsquo;s owed again.
        </p>
        <TextAreaField
          kind="reason"
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

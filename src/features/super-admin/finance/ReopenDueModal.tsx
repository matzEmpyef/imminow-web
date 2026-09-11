import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { money } from './money'
import { useVoidCommissionDue, type CommissionDuePart, type FinanceCaseRow } from '@/queries/financeDashboard'
import { showToast } from '@/lib/toast'

const MIN_REASON_LENGTH = 3

/**
 * Reopens a part Finance closed without payment (2026-09-11) — same VoidDueModal-style reason
 * popup, but voids the part's `waive_change_id` instead of an added amount's change id. It goes
 * back to counting as outstanding/overdue.
 */
export function ReopenDueModal({
  caseRow,
  part,
  onClose,
  onReopened,
}: {
  caseRow: FinanceCaseRow
  part: CommissionDuePart
  onClose: () => void
  onReopened: (row: FinanceCaseRow) => void
}) {
  const voidDue = useVoidCommissionDue()
  const [reason, setReason] = useState('')
  const trimmedReason = reason.trim()
  const invalid = trimmedReason.length < MIN_REASON_LENGTH || !part.waive_change_id
  const closedAmount = money({ amount: part.waived_amount ?? part.amount ?? 0, currency: part.currency ?? 'INR' })

  return (
    <Modal
      onClose={onClose}
      title={`Reopen ${closedAmount} closed without payment`}
      widthRem={26}
      footer={
        <>
          {voidDue.isError && <p className="mr-auto self-center text-body-sm text-error">{voidDue.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={voidDue.isPending}
            disabled={invalid}
            onClick={() =>
              part.waive_change_id &&
              voidDue.mutate(
                { entryId: caseRow.id, changeId: part.waive_change_id, reason: trimmedReason },
                {
                  onSuccess: (row) => {
                    showToast(`Due reopened for ${caseRow.applicant_name}`)
                    onReopened(row)
                  },
                },
              )
            }
          >
            Reopen
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          {part.waived_reason ? `Closed for: ${part.waived_reason}. ` : ''}It will count toward what&rsquo;s owed again.
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

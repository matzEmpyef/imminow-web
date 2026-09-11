import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { money } from './money'
import { useWaiveCommissionDue, type CommissionDuePart, type FinanceCaseRow } from '@/queries/financeDashboard'

const MIN_REASON_LENGTH = 3

/**
 * Closes a due part without payment (2026-09-11) — the consultancy owes nothing more on it, with a
 * reason they're shown. It stops counting as outstanding or overdue. Reversible: ReopenDueModal
 * voids the `waive_change_id` this part gets back once closed, the same void hook that undoes an
 * added amount.
 */
export function CloseDueModal({
  caseRow,
  part,
  label,
  onClose,
  onClosed,
}: {
  caseRow: FinanceCaseRow
  part: CommissionDuePart
  /** Context line describing the part, e.g. what FinanceCaseDrawer's partLabel() renders for it. */
  label?: string
  onClose: () => void
  onClosed: (row: FinanceCaseRow) => void
}) {
  const waiveDue = useWaiveCommissionDue()
  const [reason, setReason] = useState('')
  const trimmedReason = reason.trim()
  const invalid = trimmedReason.length < MIN_REASON_LENGTH || !part.key
  const outstanding = money({ amount: part.outstanding ?? part.amount ?? 0, currency: part.currency ?? 'INR' })

  return (
    <Modal
      onClose={onClose}
      title="Close without payment"
      widthRem={26}
      footer={
        <>
          {waiveDue.isError && <p className="mr-auto self-center text-body-sm text-error">{waiveDue.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={waiveDue.isPending}
            disabled={invalid}
            onClick={() =>
              part.key &&
              waiveDue.mutate(
                { entryId: caseRow.id, part_key: part.key, reason: trimmedReason },
                { onSuccess: (row) => onClosed(row) },
              )
            }
          >
            Close
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          {label ?? 'This part'} — outstanding {outstanding}
        </p>
        <p className="text-body-sm text-text-secondary">
          Stops this part counting as outstanding or overdue. It can be reopened later.
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

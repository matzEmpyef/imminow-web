import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { TextAreaField } from '@/components/TextAreaField'
import { useCorrectOriginalDue, type FinanceCaseRow } from '@/queries/financeDashboard'

const MIN_REASON_LENGTH = 3

function inr(n: number | undefined): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`
}

/**
 * Corrects the original, rate-calculated amount and/or gives it a due date (2026-09-11). The
 * calculated figure never changes — it stays visible here as `calculated_due_inr` — this only
 * records what Finance made of it. Clearing the date field removes it (an undated part is never
 * overdue).
 */
export function OriginalDueModal({
  caseRow,
  onClose,
  onChanged,
}: {
  caseRow: FinanceCaseRow
  onClose: () => void
  onChanged: (row: FinanceCaseRow) => void
}) {
  const correctOriginal = useCorrectOriginalDue()
  const originalPart = caseRow.due_schedule?.find((p) => p.kind === 'original')
  const [amount, setAmount] = useState(String(caseRow.original_due_inr ?? 0))
  const [dueOn, setDueOn] = useState(originalPart?.due_on ?? '')
  const [reason, setReason] = useState('')

  const parsed = Number(amount)
  const isValidAmount = amount.trim() !== '' && Number.isInteger(parsed) && parsed >= 0
  const trimmedReason = reason.trim()
  const unchanged = parsed === (caseRow.original_due_inr ?? 0) && dueOn === (originalPart?.due_on ?? '')
  const invalid = !isValidAmount || trimmedReason.length < MIN_REASON_LENGTH || unchanged

  return (
    <Modal
      onClose={onClose}
      title="Edit original amount"
      widthRem={26}
      footer={
        <>
          {correctOriginal.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{correctOriginal.error.message}</p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={correctOriginal.isPending}
            disabled={invalid}
            onClick={() =>
              correctOriginal.mutate(
                { entryId: caseRow.id, amount_inr: parsed, due_on: dueOn || null, reason: trimmedReason },
                { onSuccess: (row) => onChanged(row) },
              )
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          Calculated by the rate: <span className="font-medium text-text-primary">{inr(caseRow.calculated_due_inr)}</span>
        </p>
        <TextField
          label="Original amount (₹)"
          type="number"
          min={0}
          step={1}
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <div className="flex flex-col gap-xs">
          <label htmlFor="original-due-date" className="pl-lg text-caption text-text-secondary">
            Due date (optional — clear to remove it)
          </label>
          <input
            id="original-due-date"
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            className="h-12 rounded-full border border-border bg-surface px-5 text-body text-text-primary outline-none focus:border-2 focus:border-primary"
          />
        </div>
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

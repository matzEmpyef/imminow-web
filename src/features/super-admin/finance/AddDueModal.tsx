import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { CompactSelect } from '@/components/CompactSelect'
import { TextField } from '@/components/TextField'
import { TextAreaField } from '@/components/TextAreaField'
import { currencyOptions } from './money'
import { useAddCommissionDue, type FinanceCaseRow } from '@/queries/financeDashboard'
import { showToast } from '@/lib/toast'

const MIN_REASON_LENGTH = 3

/**
 * Adds a second instalment or agreed extra to what a case owes immiNow (2026-09-11) — separate
 * from the rate-calculated share, which is changed via OverrideDueModal instead. In the currency
 * given: this case's own currencies come first in the picker, defaulting to whichever one the
 * case already owes in. The due date is optional: an undated part waits for the close and never
 * counts as overdue.
 */
export function AddDueModal({
  caseRow,
  onClose,
  onAdded,
}: {
  caseRow: FinanceCaseRow
  onClose: () => void
  onAdded: (row: FinanceCaseRow) => void
}) {
  const addDue = useAddCommissionDue()
  const currencies = currencyOptions((caseRow.by_currency ?? []).map((c) => c.currency))
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(currencies[0] ?? 'INR')
  const [dueOn, setDueOn] = useState('')
  const [reason, setReason] = useState('')

  const parsed = Number(amount)
  const isValidAmount = amount.trim() !== '' && Number.isFinite(parsed) && parsed > 0
  const trimmedReason = reason.trim()
  const invalid = !isValidAmount || trimmedReason.length < MIN_REASON_LENGTH

  return (
    <Modal
      onClose={onClose}
      title="Add amount due"
      widthRem={26}
      footer={
        <>
          {addDue.isError && <p className="mr-auto self-center text-body-sm text-error">{addDue.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={addDue.isPending}
            disabled={invalid}
            onClick={() =>
              addDue.mutate(
                { entryId: caseRow.id, amount: parsed, currency, due_on: dueOn || null, reason: trimmedReason },
                {
                  onSuccess: (row) => {
                    showToast(`Due added for ${caseRow.applicant_name}`)
                    onAdded(row)
                  },
                },
              )
            }
          >
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          {caseRow.applicant_name} · {caseRow.consultancy_name}
        </p>
        <div className="flex items-center gap-sm">
          <TextField
            label="Amount"
            type="number"
            min={1}
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1"
          />
          <CompactSelect label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </CompactSelect>
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor="add-due-date" className="pl-lg text-caption text-text-secondary">
            Due date (optional)
          </label>
          <input
            id="add-due-date"
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
          hint="e.g. the second instalment of the college's commission. The consultancy is shown this."
        />
      </div>
    </Modal>
  )
}

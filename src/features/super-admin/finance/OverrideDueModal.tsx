import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { CompactSelect } from '@/components/CompactSelect'
import { TextField } from '@/components/TextField'
import { TextAreaField } from '@/components/TextAreaField'
import { currencyOptions, money } from './money'
import { useOverrideCommissionDue, type CommissionDuePart, type FinanceCaseRow } from '@/queries/financeDashboard'

const MIN_REASON_LENGTH = 3

/**
 * Overrides immiNow's calculated share on a case (2026-09-11) — replaces the old "Edit original
 * amount" modal now that the calculated share can span more than one currency and more than one
 * part (student/college/tuition). `mode="override"` sets or replaces the override; `mode="clear"`
 * removes it and goes back to the calculation. The calculated parts stay visible for reference —
 * an override doesn't change how they were worked out, only what's actually collected.
 */
export function OverrideDueModal({
  caseRow,
  mode,
  onClose,
  onChanged,
}: {
  caseRow: FinanceCaseRow
  mode: 'override' | 'clear'
  onClose: () => void
  onChanged: (row: FinanceCaseRow) => void
}) {
  const overrideDue = useOverrideCommissionDue()
  const calculatedParts = (caseRow.due_schedule ?? []).filter((p) => p.kind === 'calculated')
  const currencies = currencyOptions((caseRow.by_currency ?? []).map((c) => c.currency))
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(currencies[0] ?? 'INR')
  const [dueOn, setDueOn] = useState('')
  const [reason, setReason] = useState('')

  const trimmedReason = reason.trim()
  const parsed = Number(amount)
  const isValidAmount = amount.trim() !== '' && Number.isFinite(parsed) && parsed >= 0
  const invalid =
    mode === 'clear' ? trimmedReason.length < MIN_REASON_LENGTH : !isValidAmount || trimmedReason.length < MIN_REASON_LENGTH

  function partAmount(part: CommissionDuePart): string {
    return money({ amount: part.amount ?? 0, currency: part.currency ?? 'INR' })
  }

  function handleSubmit() {
    if (mode === 'clear') {
      overrideDue.mutate({ entryId: caseRow.id, clear: true, reason: trimmedReason }, { onSuccess: (row) => onChanged(row) })
      return
    }
    overrideDue.mutate(
      { entryId: caseRow.id, amount: parsed, currency, due_on: dueOn || null, reason: trimmedReason },
      { onSuccess: (row) => onChanged(row) },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={mode === 'clear' ? 'Remove the override' : 'Override the calculated share'}
      widthRem={28}
      footer={
        <>
          {overrideDue.isError && <p className="mr-auto self-center text-body-sm text-error">{overrideDue.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={mode === 'clear' ? 'destructive' : 'primary'} loading={overrideDue.isPending} disabled={invalid} onClick={handleSubmit}>
            {mode === 'clear' ? 'Remove override' : 'Save override'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        {calculatedParts.length > 0 && (
          <div className="rounded-md border border-border bg-background p-sm">
            <p className="text-caption font-medium text-text-secondary">Calculated by the rate</p>
            <div className="mt-2xs flex flex-col gap-2xs">
              {calculatedParts.map((part, i) => (
                <p key={part.id ?? `calc-${i}`} className="text-body-sm text-text-primary">
                  {partAmount(part)} <span className="text-caption text-text-secondary">({part.source ?? 'calculated'})</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {mode === 'clear' ? (
          <p className="text-body-sm text-text-secondary">
            Removes the override and goes back to what the rate calculates above.
          </p>
        ) : (
          <>
            <p className="text-body-sm text-text-secondary">
              Replaces the calculation above with a share you set directly — the calculated figures stay on record as
              a reference, they just stop being what&rsquo;s owed.
            </p>
            <div className="flex items-center gap-sm">
              <TextField
                label="Amount"
                type="number"
                min={0}
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
              <label htmlFor="override-due-date" className="pl-lg text-caption text-text-secondary">
                Due date (optional — waits for the close without one)
              </label>
              <input
                id="override-due-date"
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                className="h-12 rounded-full border border-border bg-surface px-5 text-body text-text-primary outline-none focus:border-2 focus:border-primary"
              />
            </div>
          </>
        )}

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

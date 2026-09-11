import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { CompactSelect } from '@/components/CompactSelect'
import { TextField } from '@/components/TextField'
import { TextAreaField } from '@/components/TextAreaField'
import { currencyOptions } from './money'
import { useReceiveCommissionDue, type CommissionDuePart, type FinanceCaseRow } from '@/queries/financeDashboard'
import { localDateISO } from '@/lib/time'

/**
 * Finance records that money has actually arrived (2026-09-11) — a confirmed payment with no
 * declaration from the consultancy needed; they're only told about it afterwards. Opened two ways
 * from FinanceCaseDrawer: with a `part` (its "Mark as received" action) the amount and currency
 * are pinned to that part and it settles first; without one (the case-level "Record a payment")
 * it's money that isn't tied to any single part, so both are picked here from the case's own
 * currencies.
 */
export function ReceiveDueModal({
  caseRow,
  part,
  label,
  onClose,
  onReceived,
}: {
  caseRow: FinanceCaseRow
  part: CommissionDuePart | null
  /** Context line describing the part, e.g. what FinanceCaseDrawer's partLabel() renders for it. */
  label?: string
  onClose: () => void
  onReceived: (row: FinanceCaseRow) => void
}) {
  const receiveDue = useReceiveCommissionDue()
  const currencies = currencyOptions((caseRow.by_currency ?? []).map((c) => c.currency))
  const [amount, setAmount] = useState(part ? String(part.outstanding ?? part.amount ?? '') : '')
  const [currency, setCurrency] = useState(part?.currency ?? currencies[0] ?? 'INR')
  const [receivedOn, setReceivedOn] = useState(localDateISO())
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')

  const parsed = Number(amount)
  const isValidAmount = amount.trim() !== '' && Number.isFinite(parsed) && parsed > 0
  const invalid = !isValidAmount || !receivedOn

  return (
    <Modal
      onClose={onClose}
      title={part ? 'Mark as received' : 'Record a payment'}
      widthRem={26}
      footer={
        <>
          {receiveDue.isError && <p className="mr-auto self-center text-body-sm text-error">{receiveDue.error.message}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={receiveDue.isPending}
            disabled={invalid}
            onClick={() =>
              receiveDue.mutate(
                {
                  entryId: caseRow.id,
                  amount: parsed,
                  currency: part ? (part.currency ?? undefined) : currency,
                  part_key: part?.key,
                  received_on: receivedOn,
                  reference: reference.trim() || undefined,
                  note: note.trim() || undefined,
                },
                { onSuccess: (row) => onReceived(row) },
              )
            }
          >
            {part ? 'Mark as received' : 'Record payment'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          {caseRow.applicant_name} · {caseRow.consultancy_name}
        </p>
        {label && <p className="text-body-sm text-text-primary">{label}</p>}
        <div className="flex items-center gap-sm">
          <TextField
            label="Amount"
            type="number"
            min={0.01}
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1"
          />
          {part ? (
            <span className="flex h-12 items-center rounded-full border border-border bg-background px-md text-body-sm text-text-secondary">
              {part.currency ?? 'INR'}
            </span>
          ) : (
            <CompactSelect label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </CompactSelect>
          )}
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor="receive-due-date" className="pl-lg text-caption text-text-secondary">
            Received on
          </label>
          <input
            id="receive-due-date"
            type="date"
            required
            value={receivedOn}
            onChange={(e) => setReceivedOn(e.target.value)}
            className="h-12 rounded-full border border-border bg-surface px-5 text-body text-text-primary outline-none focus:border-2 focus:border-primary"
          />
        </div>
        <TextField label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        <TextAreaField label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-caption text-text-secondary">
          Records the money as received — no declaration from the consultancy is needed. They&rsquo;re told.
        </p>
      </div>
    </Modal>
  )
}

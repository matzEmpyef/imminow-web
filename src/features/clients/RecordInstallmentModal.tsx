import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { useRecordInstallment } from '@/queries/commissionEntries'
import { CURRENCIES } from '@/features/super-admin/courseFormShared'
import type { components } from '@/api/schema'

type Receipt = components['schemas']['Receipt']
type Entry = components['schemas']['CommissionEntryDetail']

/**
 * One received payment against the case's commission entry (2026-08-28). Partial amounts and
 * multiple installments are the expected shape. A platform receipt is a linkable reference,
 * never a requirement — consultancies invoicing externally record installments with nothing
 * attached.
 */
export function RecordInstallmentModal({
  clientId,
  entry,
  receipts,
  onClose,
}: {
  clientId: string
  entry: Entry
  receipts: Receipt[]
  onClose: () => void
}) {
  const record = useRecordInstallment(clientId)

  // Which sources make sense follows the payer method; split offers both.
  const sources: Array<'college' | 'student'> =
    entry.payer_method === 'college' ? ['college'] : entry.payer_method === 'applicant' ? ['student'] : ['college', 'student']

  const [source, setSource] = useState<'college' | 'student'>(sources[0])
  const defaultCurrency =
    (sources[0] === 'college' ? entry.expected_from_college?.currency : entry.expected_from_student?.currency) ?? 'INR'
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [receiptId, setReceiptId] = useState('')

  function pickSource(next: 'college' | 'student') {
    setSource(next)
    const expected = next === 'college' ? entry.expected_from_college : entry.expected_from_student
    if (expected?.currency) setCurrency(expected.currency)
  }

  const canSubmit = Number(amount) > 0 && !record.isPending

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    record.mutate(
      {
        entryId: entry.id,
        source,
        amount: { amount: Number(amount), currency },
        received_on: receivedOn,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(receiptId ? { receipt_id: receiptId } : {}),
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Record Payment Received"
      widthRem={32}
      footer={
        <>
          {record.isError && <p className="mr-auto self-center text-body-sm text-error">{record.error.message}</p>}
          <div className="flex gap-sm">
            <Button type="submit" form="record-installment-form" loading={record.isPending} disabled={!canSubmit}>
              Record
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <form id="record-installment-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        {sources.length > 1 && (
          <SelectField label="Received from" value={source} onChange={(e) => pickSource(e.target.value as 'college' | 'student')}>
            <option value="college">College</option>
            <option value="student">Applicant</option>
          </SelectField>
        )}
        <div className="grid grid-cols-3 gap-sm">
          <TextField
            label="Amount"
            type="number"
            min="1"
            required
            className="col-span-2"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <SelectField label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
        </div>
        <TextField label="Received on" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
        <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {receipts.length > 0 && (
          <SelectField label="Link a platform receipt (optional)" value={receiptId} onChange={(e) => setReceiptId(e.target.value)}>
            <option value="">None — recorded outside the platform</option>
            {receipts.map((r) => (
              <option key={r.id} value={r.id}>
                {r.invoice_number} — {(r.amount.amount ?? 0).toLocaleString()} {r.amount.currency}
              </option>
            ))}
          </SelectField>
        )}
      </form>
    </Modal>
  )
}

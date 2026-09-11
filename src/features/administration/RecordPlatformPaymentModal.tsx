import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { CompactSelect } from '@/components/CompactSelect'
import { TextField } from '@/components/TextField'
import { useRecordCommissionPayment } from '@/queries/commission'
import { formatMoneyAmount } from '@/lib/money'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'

type CommissionDue = components['schemas']['CommissionDue']

const money = formatMoneyAmount

// Replaces the old standalone "Record a Payment" form (user decision, 2026-08-28): a payment is
// now declared AGAINST one due row, not into an undifferentiated pool. Opened by clicking the
// case's row on the Active Cases tab. Amount starts prefilled with what's actually left in the
// chosen currency but stays editable — a consultant may still want to declare a different amount.
// No proof upload: "no other proof needed", just an optional transaction id for their own
// reference.
//
// Currency (2026-09-11): every part is owed in the currency it arrives in, so a case with a
// college part in CAD and a student part in the consultancy's own currency needs a currency
// choice, not an assumed INR. Options come from the case's own currencies (`by_currency`),
// defaulting to whichever still owes the most; falls back to INR for a case with none recorded.
export function RecordPlatformPaymentModal({ due, onClose }: { due: CommissionDue; onClose: () => void }) {
  const recordPayment = useRecordCommissionPayment()
  const byCurrency = due.by_currency ?? []
  // Options and the initial currency are only ever computed once, from the `due` this modal was
  // opened with — a fresh mount per case click, not a value that needs to react to later renders.
  const codes = [...new Set(byCurrency.map((c) => c.currency).filter((c): c is string => Boolean(c)))]
  const currencyOptions = codes.length > 0 ? codes : ['INR']
  const largestOutstanding = [...byCurrency].sort((a, b) => (b.outstanding ?? 0) - (a.outstanding ?? 0))[0]
  const defaultCurrency = largestOutstanding?.currency ?? 'INR'

  const [currency, setCurrency] = useState(defaultCurrency)
  const currencyOutstanding = byCurrency.find((c) => c.currency === currency)?.outstanding ?? 0
  const [amount, setAmount] = useState(String(Math.max(0, currencyOutstanding)))
  const [transactionId, setTransactionId] = useState('')
  // One key per modal open, not per attempt (N7, second-pass review): a key minted inside
  // mutationFn made every submit a distinct operation, so Enter-Enter before the button disabled
  // declared the amount twice. A stable key lets the (Phase 6) backend treat a retry of THIS
  // declaration as the same operation; the mock ignores the header today, which is why the
  // isPending guard below is the protection that matters right now.
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  function handleCurrencyChange(next: string) {
    setCurrency(next)
    const outstanding = byCurrency.find((c) => c.currency === next)?.outstanding ?? 0
    setAmount(String(Math.max(0, outstanding)))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (recordPayment.isPending) return
    const value = Number(amount)
    if (!amount || Number.isNaN(value) || value <= 0) return
    recordPayment.mutate(
      {
        commission_entry_id: due.id,
        amount: value,
        currency,
        transaction_id: transactionId.trim() || null,
        idempotencyKey,
      },
      {
        onSuccess: () => {
          showToast(`Payment recorded for ${due.applicant_name}`)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Record a Payment"
      widthRem={28}
      footer={
        <>
          {recordPayment.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{recordPayment.error.message}</p>
          )}
          <div className="flex gap-sm">
            <Button
              type="submit"
              form="record-platform-payment-form"
              loading={recordPayment.isPending}
              disabled={!amount || Number(amount) <= 0}
            >
              Declare
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <form id="record-platform-payment-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <div className="rounded-md bg-background p-sm">
          <p className="text-body-sm font-medium text-text-primary">
            {due.applicant_name} · {due.case_type === 'pr' ? 'PR case' : (due.college_name ?? '—')}
          </p>
          <p className="mt-2xs text-caption text-text-secondary">
            Outstanding {money(due.platform_outstanding ?? due.platform_due)}
            {(due.platform_expected?.amount ?? 0) > 0 ? ` · ${money(due.platform_expected)} not yet due` : ''}
            {(due.platform_paid.amount ?? 0) > 0 ? ` · ${money(due.platform_paid)} paid` : ''}
            {(due.platform_awaiting.amount ?? 0) > 0 ? ` · ${money(due.platform_awaiting)} awaiting confirmation` : ''}
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <TextField label="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="flex-1" />
          <CompactSelect label="Currency" value={currency} onChange={(e) => handleCurrencyChange(e.target.value)}>
            {currencyOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </CompactSelect>
        </div>
        <p className="text-caption text-text-secondary">
          {currency} outstanding on this case: {money({ amount: currencyOutstanding, currency })}
        </p>
        <TextField
          label="Transaction ID (optional)"
          value={transactionId}
          onChange={(e) => setTransactionId(e.target.value)}
          placeholder="UTR / UPI reference"
        />
      </form>
    </Modal>
  )
}

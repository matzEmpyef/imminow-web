import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { money } from './money'
import { useConfirmCommissionPayment, type CommissionPayment } from '@/queries/commission'

const MIN_REASON_LENGTH = 3

interface Result {
  succeeded: number
  failed: number
}

function approxInr(amountInr: number | undefined, currency: string | undefined): string | null {
  if (!currency || currency === 'INR' || amountInr == null) return null
  return `≈ ₹${amountInr.toLocaleString('en-IN')}`
}

/**
 * Confirms a batch of declared payments (2026-09-11 Awaiting Confirmation bulk bar). Each row gets
 * its own editable "Amount received" (prefilled with what was declared, in that payment's own
 * currency — payments in a batch need not share a currency) — a row whose amount no longer matches
 * the declaration needs its own note, same rule ConfirmPaymentModal applies one at a time. The
 * endpoint only confirms one payment at a time, so this runs them in sequence with each row's own
 * body and reports how many landed — a partial failure (one payment already rejected by someone
 * else, say) shouldn't hide behind a single all-or-nothing error.
 */
export function BulkConfirmModal({
  payments,
  onClose,
  onDone,
}: {
  payments: CommissionPayment[]
  onClose: () => void
  onDone: () => void
}) {
  const confirm = useConfirmCommissionPayment()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(payments.map((p) => [p.id, String(p.amount.amount ?? 0)])),
  )
  const [notes, setNotes] = useState<Record<string, string>>({})

  function changedAmount(p: CommissionPayment): boolean {
    const parsed = Number(amounts[p.id])
    return Number.isFinite(parsed) && parsed !== (p.amount.amount ?? 0)
  }

  function rowValid(p: CommissionPayment): boolean {
    const parsed = Number(amounts[p.id])
    if (amounts[p.id]?.trim() === '' || !Number.isFinite(parsed) || parsed <= 0) return false
    if (changedAmount(p) && (notes[p.id] ?? '').trim().length < MIN_REASON_LENGTH) return false
    return true
  }

  const allValid = payments.every(rowValid)
  const currencies = new Set(payments.map((p) => p.amount.currency ?? 'INR'))
  const total = payments.reduce((sum, p) => sum + (p.amount.amount ?? 0), 0)
  const totalInr = payments.reduce((sum, p) => sum + (p.amount.currency === 'INR' || !p.amount.currency ? (p.amount.amount ?? 0) : (p.amount_inr ?? 0)), 0)

  async function handleConfirm() {
    setRunning(true)
    let succeeded = 0
    let failed = 0
    for (const payment of payments) {
      try {
        const parsed = Number(amounts[payment.id])
        const differs = changedAmount(payment)
        await confirm.mutateAsync({
          paymentId: payment.id,
          receivedAmount: parsed,
          note: differs ? notes[payment.id]?.trim() : undefined,
        })
        succeeded++
      } catch {
        failed++
      }
    }
    setRunning(false)
    setResult({ succeeded, failed })
    onDone()
  }

  return (
    <Modal
      onClose={onClose}
      title={`Confirm ${payments.length} selected payment${payments.length === 1 ? '' : 's'}`}
      widthRem={32}
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={running}>
              Cancel
            </Button>
            <Button loading={running} disabled={!allValid} onClick={handleConfirm}>
              Confirm received
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-md">
        {result ? (
          <p className="text-body-sm text-text-primary">
            {result.succeeded} confirmed{result.failed > 0 ? `, ${result.failed} failed — try those again individually.` : '.'}
          </p>
        ) : (
          <>
            <p className="text-body-sm text-text-secondary">
              Only confirm once the money is in immiNow&rsquo;s account. This can&rsquo;t be undone. A different
              amount than declared needs a reason for that row.
            </p>
            <div className="flex max-h-96 flex-col gap-sm overflow-y-auto">
              {payments.map((p) => {
                const currency = p.amount.currency ?? 'INR'
                const differs = changedAmount(p)
                const approx = approxInr(p.amount_inr, currency)
                return (
                  <div key={p.id} className="flex flex-col gap-xs rounded-md border border-border px-sm py-sm">
                    <div className="flex items-center justify-between gap-sm">
                      <div>
                        <p className="text-body-sm font-medium text-text-primary">{p.consultancy_name ?? 'Unknown'}</p>
                        <p className="text-caption text-text-secondary">{p.applicant_name ?? 'General'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-body-sm tabular-nums text-text-primary">Declared {money(p.amount)}</p>
                        {approx && <p className="text-caption text-text-secondary">{approx}</p>}
                      </div>
                    </div>
                    <div className="flex items-end gap-sm">
                      <TextField
                        label={`Amount received (${currency})`}
                        type="number"
                        min={0}
                        required
                        value={amounts[p.id] ?? ''}
                        onChange={(e) => setAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        className="flex-1"
                      />
                    </div>
                    {differs && (
                      <TextField
                        label="Why is it different?"
                        required
                        value={notes[p.id] ?? ''}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      />
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-body-sm font-medium text-text-primary">
              Total declared:{' '}
              {currencies.size === 1 ? money({ amount: total, currency: [...currencies][0] }) : `≈ ₹${totalInr.toLocaleString('en-IN')} (mixed currencies)`}
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}

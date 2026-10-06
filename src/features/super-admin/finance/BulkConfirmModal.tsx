import { useCallback, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { BatchResultList } from '@/components/BatchResultList'
import { batchSummary, useBatchRun } from '@/lib/useBatchRun'
import { money, paymentInrNote, paymentMoney } from './money'
import { useConfirmCommissionPayment, type CommissionPayment } from '@/queries/commission'

const MIN_REASON_LENGTH = 3

/**
 * Confirms a batch of declared payments (2026-09-11 Awaiting Confirmation bulk bar). Each row gets
 * its own editable "Amount received" (prefilled with what was declared, in that payment's own
 * currency — payments in a batch need not share a currency) — a row whose amount no longer matches
 * the declaration needs its own note, same rule ConfirmPaymentModal applies one at a time. The
 * endpoint only confirms one payment at a time, so this runs them in sequence with each row's own
 * body.
 *
 * While the batch runs the dialog cannot be closed (review F-153): closing it used to leave the
 * loop running, unseen, so the remaining payments were confirmed anyway. "Stop after this one"
 * ends the batch between two payments, and the result names every payment with what happened to
 * it — confirmed, failed (with the reason), or not sent. See `useBatchRun`.
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

  const { mutateAsync: confirmOne } = confirm
  const batch = useBatchRun<CommissionPayment>(
    useCallback(
      (payment) => {
        const parsed = Number(amounts[payment.id])
        const differs = Number.isFinite(parsed) && parsed !== (payment.amount.amount ?? 0)
        return confirmOne({
          paymentId: payment.id,
          receivedAmount: parsed,
          note: differs ? notes[payment.id]?.trim() : undefined,
        })
      },
      [amounts, notes, confirmOne],
    ),
  )

  const allValid = payments.every(rowValid)
  const currencies = new Set(payments.map((p) => p.amount.currency ?? 'INR'))
  const total = payments.reduce((sum, p) => sum + (p.amount.amount ?? 0), 0)
  const totalInr = payments.reduce((sum, p) => sum + (p.amount.currency === 'INR' || !p.amount.currency ? (p.amount.amount ?? 0) : (p.amount_inr ?? 0)), 0)

  async function handleConfirm() {
    await batch.start(payments)
    onDone()
  }

  const started = batch.running || batch.finished
  const sentSoFar = batch.rows.filter((row) => row.status !== 'waiting').length
  // Once started, the batch is what was started: the selection behind this dialog empties as
  // payments are confirmed, and the title must not count down with it.
  const count = started ? batch.rows.length : payments.length

  return (
    <Modal
      onClose={onClose}
      locked={batch.running}
      title={`Confirm ${count} selected payment${count === 1 ? '' : 's'}`}
      widthRem={32}
      footer={
        batch.finished ? (
          <Button onClick={onClose}>Done</Button>
        ) : batch.running ? (
          <Button variant="secondary" onClick={batch.stop} disabled={batch.stopping}>
            {batch.stopping ? 'Stopping…' : 'Stop after this one'}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!allValid} onClick={handleConfirm}>
              Confirm received
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-md">
        {started ? (
          <>
            <p role="status" className="text-body-sm text-text-primary">
              {batch.running
                ? `Confirming ${Math.min(sentSoFar, batch.rows.length)} of ${batch.rows.length}… Keep this window open until it finishes.`
                : batchSummary(batch.counts, 'confirmed')}
            </p>
            <BatchResultList
              rows={batch.rows}
              rowKey={(p) => p.id}
              words={{ done: 'Confirmed', running: 'Confirming…' }}
              renderLabel={(p) => (
                <>
                  <span className="font-medium">{p.consultancy_name ?? 'Unknown'}</span>
                  <span className="text-text-secondary"> · {p.applicant_name ?? 'General'} · </span>
                  <span className="tabular-nums">{paymentMoney(p)}</span>
                </>
              )}
            />
            {batch.finished && batch.counts.failed + batch.counts.skipped > 0 && (
              <p className="text-body-sm text-text-secondary">
                Payments marked Failed or Not sent are still awaiting confirmation. Confirm those one at a time.
              </p>
            )}
          </>
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
                // The rate the row was valued at, frozen when it was declared (M15).
                const approx = paymentInrNote(p)
                return (
                  <div key={p.id} className="flex flex-col gap-xs rounded-md border border-border px-sm py-sm">
                    <div className="flex items-center justify-between gap-sm">
                      <div>
                        <p className="text-body-sm font-medium text-text-primary">{p.consultancy_name ?? 'Unknown'}</p>
                        <p className="text-caption text-text-secondary">{p.applicant_name ?? 'General'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-body-sm tabular-nums text-text-primary">Declared {paymentMoney(p)}</p>
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

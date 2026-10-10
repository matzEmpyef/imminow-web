import { hasTooManyDecimals } from '@/lib/moneyInput'
import { MoneyField } from '@/components/MoneyField'
import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '@/api/errors'
import { useDebouncedValue } from '@/lib/useDebounce'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { BatchResultList } from '@/components/BatchResultList'
import { batchSummary, useBatchRun } from '@/lib/useBatchRun'
import { paymentInrNote, paymentMoney, paymentsTotalLabel } from './money'
import { useConfirmCommissionPayment, useConfirmPreview, type CommissionPayment } from '@/queries/commission'

const MIN_REASON_LENGTH = 3

/**
 * Confirms a batch of declared payments (2026-09-11 Awaiting Confirmation bulk bar). Each row gets
 * its own editable "Amount received" (prefilled with what was declared, in that payment's own
 * currency — payments in a batch need not share a currency) — a row whose amount no longer matches
 * the declaration needs its own note, same rule ConfirmPaymentModal applies one at a time. The
 * endpoint only confirms one payment at a time, so this runs them in sequence with each row's own
 * body.
 *
 * WHETHER A ROW DIFFERS IS THE SERVER'S ANSWER (review F-300, 2026-10-10). A row whose amount the
 * person has changed asks `POST /commission/payments/{id}/confirm/preview` after a short pause in
 * its own typing (one request per changed row, cancelled when that row changes again) and shows
 * the note box only when the server says `needs_note`. A row left as declared asks nothing. The
 * selection total below is a plain total of the ticked rows and is not a judgement.
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

  // What each row started as: a row is "changed" once its text is not that text any more. Whether
  // the change matters (whether it needs a note) is the server's answer, reported by the row.
  const [initialAmounts] = useState(amounts)
  const [verdicts, setVerdicts] = useState<Record<string, RowVerdict>>({})

  const reportVerdict = useCallback((id: string, verdict: RowVerdict) => {
    setVerdicts((prev) => {
      const before = prev[id]
      return before && before.state === verdict.state && before.needsNote === verdict.needsNote ? prev : { ...prev, [id]: verdict }
    })
  }, [])

  function changed(p: CommissionPayment): boolean {
    return amounts[p.id] !== initialAmounts[p.id]
  }

  /** The server says a note is needed for this row's changed amount. */
  function needsNote(p: CommissionPayment): boolean {
    const verdict = verdicts[p.id]
    return changed(p) && verdict?.state === 'answered' && verdict.needsNote
  }

  function rowValid(p: CommissionPayment): boolean {
    const parsed = Number(amounts[p.id])
    if (amounts[p.id]?.trim() === '' || !Number.isFinite(parsed) || parsed <= 0 || hasTooManyDecimals(amounts[p.id])) return false
    if (changed(p)) {
      // The server has not said yet whether the change needs a note.
      const verdict = verdicts[p.id]
      if (!verdict || verdict.state === 'pending') return false
    }
    if (needsNote(p) && (notes[p.id] ?? '').trim().length < MIN_REASON_LENGTH) return false
    return true
  }

  const { mutateAsync: confirmOne } = confirm
  const batch = useBatchRun<CommissionPayment>(
    useCallback(
      (payment) => {
        const parsed = Number(amounts[payment.id])
        const verdict = verdicts[payment.id]
        const noteNeeded = amounts[payment.id] !== initialAmounts[payment.id] && verdict?.state === 'answered' && verdict.needsNote
        return confirmOne({
          paymentId: payment.id,
          receivedAmount: parsed,
          note: noteNeeded ? notes[payment.id]?.trim() : undefined,
        })
      },
      [amounts, notes, verdicts, initialAmounts, confirmOne],
    ),
  )

  const allValid = payments.every(rowValid)

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
              {payments.map((p) => (
                <BulkConfirmRow
                  key={p.id}
                  payment={p}
                  initialAmount={initialAmounts[p.id]}
                  amount={amounts[p.id] ?? ''}
                  note={notes[p.id] ?? ''}
                  onAmount={(value) => setAmounts((prev) => ({ ...prev, [p.id]: value }))}
                  onNote={(value) => setNotes((prev) => ({ ...prev, [p.id]: value }))}
                  onVerdict={reportVerdict}
                />
              ))}
            </div>
            <p className="text-body-sm font-medium text-text-primary">
              {/* The same words as the button that opened this dialog (review F-159). */}
              Total declared: {paymentsTotalLabel(payments)}
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}

/** What the server said about one row's changed amount. */
interface RowVerdict {
  /** `none`: the amount is as declared (or unreadable), nothing was asked. */
  state: 'none' | 'pending' | 'answered' | 'refused'
  needsNote: boolean
}

/**
 * One row of the batch: its own amount box, and — once the amount is changed — its own question to
 * the server's confirm preview, after a pause in this row's typing and cancelled when the row
 * changes again. The server's answer decides whether the note box shows; a refusal shows the
 * server's sentence and does not stop the typing.
 */
function BulkConfirmRow({
  payment,
  initialAmount,
  amount,
  note,
  onAmount,
  onNote,
  onVerdict,
}: {
  payment: CommissionPayment
  initialAmount: string
  amount: string
  note: string
  onAmount: (value: string) => void
  onNote: (value: string) => void
  onVerdict: (id: string, verdict: RowVerdict) => void
}) {
  const currency = payment.amount.currency ?? 'INR'
  // The rate the row was valued at, frozen when it was declared (M15).
  const approx = paymentInrNote(payment)

  const parsed = Number(amount)
  const readable = amount.trim() !== '' && Number.isFinite(parsed) && parsed > 0 && !hasTooManyDecimals(amount)
  // Asked only for a changed, readable amount.
  const asked = amount !== initialAmount && readable ? parsed : null
  const settled = useDebouncedValue(asked)
  const preview = useConfirmPreview(payment.id, settled ?? undefined, settled != null)
  const draftSettled = asked != null && settled === asked
  // The answer belongs to the amount it was asked for: not used while the row has moved on.
  const answer = draftSettled && !preview.isFetching ? preview.data : undefined
  const refusal = draftSettled && preview.error instanceof ApiError ? preview.error : null

  const state: RowVerdict['state'] = asked == null ? 'none' : answer ? 'answered' : refusal ? 'refused' : 'pending'
  const needsNote = answer?.needs_note === true
  useEffect(() => {
    onVerdict(payment.id, { state, needsNote })
  }, [onVerdict, payment.id, state, needsNote])

  return (
    <div className="flex flex-col gap-xs rounded-md border border-border px-sm py-sm">
      <div className="flex items-center justify-between gap-sm">
        <div>
          <p className="text-body-sm font-medium text-text-primary">{payment.consultancy_name ?? 'Unknown'}</p>
          <p className="text-caption text-text-secondary">{payment.applicant_name ?? 'General'}</p>
        </div>
        <div className="text-right">
          <p className="text-body-sm tabular-nums text-text-primary">Declared {paymentMoney(payment)}</p>
          {approx && <p className="text-caption text-text-secondary">{approx}</p>}
        </div>
      </div>
      <div className="flex items-end gap-sm">
        <MoneyField
          label={`Amount received (${currency})`}
          min={0}
          required
          value={amount}
          onChange={(e) => onAmount(e.target.value)}
          className="flex-1"
        />
      </div>
      {refusal && (
        <p role="status" className="text-caption text-text-secondary">
          {refusal.message}
        </p>
      )}
      {needsNote && (
        <TextField label="Why is it different?" required value={note} onChange={(e) => onNote(e.target.value)} />
      )}
    </div>
  )
}

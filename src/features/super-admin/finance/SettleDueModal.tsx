import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { ApiError } from '@/api/errors'
import { money } from './money'
import { useSettleCommissionDue, type CommissionDuePart, type FinanceCaseRow } from '@/queries/financeDashboard'
import { showToast } from '@/lib/toast'
import { ALREADY_APPLIED_NOTICE, isAlreadyApplied, usePayloadIdempotencyKey } from '@/lib/useIdempotencyKey'
import { StillNeeded } from '@/components/StillNeeded'
import { isTextOk } from '@/lib/validation'

/**
 * What the person is told when the difference is above what Finance may write off (403
 * `permission_denied`): both percentages are the server's, from the error's `details`. Null for
 * any other refusal, whose own sentence is shown.
 */
function settleLimitMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== 'permission_denied') return null
  const shortfall = error.details?.shortfall_percent
  const limit = error.details?.limit_percent
  if (typeof shortfall !== 'number' || typeof limit !== 'number') return null
  return `This difference is ${shortfall}%. Above ${limit}% a Super Admin must do this.`
}

/**
 * Small-difference settlement (owner's ruling 2026-10-06): marks a due part as fully paid by
 * writing off a small shortfall, with a reason. The books keep the money received and the amount
 * written off as two separate figures. Every figure here is the server's — the amounts on the
 * part and its `shortfall_percent`; nothing is worked out in the browser. FinanceCaseDrawer offers
 * this only when the part's `settle_needs` says the signed-in person may use it.
 */
export function SettleDueModal({
  caseRow,
  part,
  label,
  onClose,
  onSettled,
}: {
  caseRow: FinanceCaseRow
  part: CommissionDuePart
  /** Context line describing the part, e.g. what FinanceCaseDrawer's partLabel() renders for it. */
  label?: string
  onClose: () => void
  onSettled: (row: FinanceCaseRow) => void
}) {
  const settleDue = useSettleCommissionDue()
  const [reason, setReason] = useState('')
  const { keyFor, settle } = usePayloadIdempotencyKey()
  const trimmedReason = reason.trim()
  const invalid = !isTextOk('reason', reason) || !part.key
  const currency = part.currency ?? 'INR'

  return (
    <Modal
      onClose={onClose}
      title="Mark as fully paid"
      widthRem={26}
      footer={
        <>
          {settleDue.isError && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {settleLimitMessage(settleDue.error) ?? settleDue.error.message}
            </p>
          )}
          <StillNeeded items={isTextOk('reason', reason) ? [] : ['the reason']} />
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={settleDue.isPending}
            disabled={invalid}
            onClick={() => {
              if (!part.key) return
              const payload = { entryId: caseRow.id, part_key: part.key, reason: trimmedReason }
              settleDue.mutate(
                { ...payload, idempotencyKey: keyFor(payload) },
                {
                  onError: (err) => {
                    settle(err)
                    // Already recorded (the first answer was lost): the write is done. Close, say so, never resubmit.
                    if (isAlreadyApplied(err)) {
                      showToast(ALREADY_APPLIED_NOTICE)
                      onClose()
                    }
                  },
                  onSuccess: (row) => {
                    showToast(`Marked as fully paid for ${caseRow.applicant_name}`)
                    onSettled(row)
                  },
                },
              )
            }}
          >
            Mark as fully paid
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          {caseRow.applicant_name} · {caseRow.consultancy_name}
        </p>
        {label && <p className="text-body-sm text-text-primary">{label}</p>}
        <dl className="grid grid-cols-2 gap-x-md gap-y-xs rounded-md border border-border p-sm text-body-sm">
          <dt className="text-text-secondary">Due</dt>
          <dd className="text-right tabular-nums text-text-primary">{money({ amount: part.amount, currency })}</dd>
          <dt className="text-text-secondary">Received</dt>
          <dd className="text-right tabular-nums text-text-primary">{money({ amount: part.paid, currency })}</dd>
          <dt className="text-text-secondary">Difference to write off</dt>
          <dd className="text-right font-medium tabular-nums text-text-primary">
            {money({ amount: part.outstanding, currency })} · {part.shortfall_percent}%
          </dd>
        </dl>
        <p className="text-caption text-text-secondary">
          The part will read as fully paid. The amount received stays as it is, and the difference is kept as its own
          written-off figure. The consultancy is told.
        </p>
        <TextAreaField
          kind="reason"
          label="Reason"
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="Kept on the audit record."
        />
      </div>
    </Modal>
  )
}

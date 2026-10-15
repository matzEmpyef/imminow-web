import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { formatDate } from '@/lib/time'
import { useDecideInstallmentVoid, type CommissionDuePart, type FinanceCaseRow } from '@/queries/financeDashboard'
import { showToast } from '@/lib/toast'

const MIN_REASON_LENGTH = 3

/**
 * Finance's answer to a consultancy's void of an installment whose share is already due (review
 * F-078, owner's decision 12). Approving voids the installment exactly as the consultancy asked,
 * with their reason, and the share part goes. Declining needs a reason, which the consultancy is
 * shown, and leaves the installment and its share as they are.
 *
 * The server refuses when the request no longer stands — no void is waiting (409 `conflict`), the
 * installment is already void (`already_voided`), or a payment was applied to the share meanwhile
 * (`part_settled`). Its sentence is shown, and the case behind this dialog is read again.
 */
export function InstallmentVoidDecisionModal({
  caseRow,
  part,
  label,
  decision,
  onClose,
  onDecided,
}: {
  caseRow: FinanceCaseRow
  part: CommissionDuePart
  /** Context line describing the part, e.g. what FinanceCaseDrawer's partLabel() renders for it. */
  label?: string
  decision: 'approve' | 'decline'
  onClose: () => void
  onDecided: (row: FinanceCaseRow) => void
}) {
  const decide = useDecideInstallmentVoid()
  const [reason, setReason] = useState('')
  const trimmedReason = reason.trim()
  const approving = decision === 'approve'
  const invalid = !part.instalment_id || (!approving && trimmedReason.length < MIN_REASON_LENGTH)

  return (
    <Modal
      onClose={onClose}
      title={approving ? 'Approve the void' : 'Decline the void'}
      widthRem={26}
      footer={
        <>
          {decide.isError && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {decide.error.message}
            </p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={approving ? 'destructive' : 'primary'}
            loading={decide.isPending}
            disabled={invalid}
            onClick={() =>
              part.instalment_id &&
              decide.mutate(
                {
                  entryId: caseRow.id,
                  installmentId: part.instalment_id,
                  approve: approving,
                  reason: approving ? undefined : trimmedReason,
                },
                {
                  onSuccess: (row) => {
                    showToast(
                      approving
                        ? `Instalment voided for ${caseRow.applicant_name}`
                        : `Void declined for ${caseRow.applicant_name}`,
                    )
                    onDecided(row)
                  },
                },
              )
            }
          >
            {approving ? 'Approve and void' : 'Decline'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          {caseRow.applicant_name} · {caseRow.consultancy_name}
        </p>
        {label && <p className="text-body-sm text-text-primary">{label}</p>}
        <p className="text-body-sm text-text-secondary">
          The consultancy asked to void this instalment
          {part.instalment_void_requested_at ? ` on ${formatDate(part.instalment_void_requested_at)}` : ''}
          {part.instalment_void_request_reason ? `: ${part.instalment_void_request_reason}` : '.'}
        </p>
        {approving ? (
          <p className="text-caption text-text-secondary">
            The instalment is voided with the consultancy&rsquo;s reason and its share is taken off what the case owes.
            The consultancy is told.
          </p>
        ) : (
          <TextAreaField
            label="Reason"
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            hint="The consultancy is shown this reason. The instalment and its share stay as they are."
          />
        )}
      </div>
    </Modal>
  )
}

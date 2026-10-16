import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { useVoidPrCommissionEntry } from '@/queries/clients'
import { formatMoneyAmount } from '@/lib/money'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'
import { REASON_MIN } from '@/lib/validation'

/**
 * Voids a PR case's agreed contribution recorded with the wrong amount or currency (review F-081),
 * so the right one can be recorded. The entry is never deleted — it stays on record, voided, with
 * the reason — so a reason is mandatory. The server refuses once money is recorded against the
 * contribution (409 `part_settled`: void those payments first) and on a student case (409
 * `conflict`); its sentence is shown here as it is.
 */
export function VoidPrContributionModal({
  clientId,
  contribution,
  onClose,
}: {
  clientId: string
  /** The agreed amount being voided, for the title and the explanation. */
  contribution: components['schemas']['Money'] | null | undefined
  onClose: () => void
}) {
  const voidEntry = useVoidPrCommissionEntry(clientId)
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  const amount = contribution ? formatMoneyAmount(contribution) : null

  return (
    <Modal
      onClose={onClose}
      title={amount ? `Void contribution — ${amount}` : 'Void contribution'}
      widthRem={28}
      footer={
        <>
          {voidEntry.isError && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {voidEntry.error.message}
            </p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={voidEntry.isPending}
            disabled={trimmed.length < REASON_MIN}
            onClick={() =>
              voidEntry.mutate(trimmed, {
                onSuccess: () => {
                  showToast('Contribution voided')
                  onClose()
                },
              })
            }
          >
            Void contribution
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          Voiding keeps the contribution on record, marked void. You can then record the right amount for this PR
          case.
        </p>
        <TextAreaField
          kind="reason"
          label="Reason"
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="Kept on the audit record, e.g. “recorded in the wrong currency”."
        />
      </div>
    </Modal>
  )
}

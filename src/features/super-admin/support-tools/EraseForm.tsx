import { useState } from 'react'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useEraseUserData, type UserSearchResult } from '@/queries/supportTools'

/**
 * Queues permanent deletion of a user's personal data. Super-admin only — the parent hides this
 * card entirely for anyone else — irreversible after a 30-day window, so it's gated behind typing
 * "ERASE" as well as a reason.
 */
export function EraseForm({ result, onCancel }: { result: UserSearchResult; onCancel: () => void }) {
  const eraseData = useEraseUserData()
  const [reason, setReason] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [succeeded, setSucceeded] = useState(false)

  if (succeeded) {
    return (
      <div className="flex flex-col gap-sm">
        <p className="text-body-sm text-success">
          Erasure queued for {result.name} — completes in 30 days unless it's cancelled before then.
        </p>
        <div>
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-sm">
      <p className="text-body-sm font-semibold text-error">{result.name}</p>
      <p className="text-caption text-text-secondary">
        Queues deletion of this user's personal data. It completes after a 30-day window and cannot be undone once
        that window passes.
      </p>
      <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
      <TextField label={'Type "ERASE" to confirm'} required value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
      {eraseData.isError && <p className="text-body-sm text-error">{eraseData.error.message}</p>}
      <div className="flex items-center justify-end gap-sm">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={!reason.trim() || confirmText !== 'ERASE'}
          loading={eraseData.isPending}
          onClick={() =>
            eraseData.mutate({ id: result.id, reason: reason.trim() }, { onSuccess: () => setSucceeded(true) })
          }
        >
          Erase user data
        </Button>
      </div>
    </div>
  )
}

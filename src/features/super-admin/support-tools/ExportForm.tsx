import { useState } from 'react'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useExportUserData, type UserSearchResult } from '@/queries/supportTools'

/** Queues a full data export for a data-access request. Reason required since 2026-09-11. */
export function ExportForm({ result, onCancel }: { result: UserSearchResult; onCancel: () => void }) {
  const exportData = useExportUserData()
  const [reason, setReason] = useState('')
  const [succeeded, setSucceeded] = useState(false)

  if (succeeded) {
    return (
      <div className="flex flex-col gap-sm">
        <p className="text-body-sm text-success">
          Export queued. The copy goes to {result.name}'s own verified email as a link that works for 7 days — it is
          not sent to you.
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
      <p className="text-caption text-text-secondary">
        Generates a full copy of everything Sentpo holds on this user and emails it to that user's own verified address
        (a link that works for 7 days). You do not receive it. Safe to run — it only reads.
      </p>
      <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
      {exportData.isError && <p className="text-body-sm text-error">{exportData.error.message}</p>}
      <div className="flex items-center justify-end gap-sm">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={reason.trim().length < 3}
          loading={exportData.isPending}
          onClick={() =>
            exportData.mutate({ id: result.id, reason: reason.trim() }, { onSuccess: () => setSucceeded(true) })
          }
        >
          Generate export
        </Button>
      </div>
    </div>
  )
}

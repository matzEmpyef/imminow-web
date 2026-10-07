import { useState } from 'react'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { formatDateTime } from '@/lib/time'
import { useExportUserData, type UserSearchResult } from '@/queries/supportTools'

/**
 * Asks for a full copy of a user's data on their behalf (reason required since 2026-09-11).
 *
 * The copy is for the USER (gate 12, F34; gate 12f): their verified email is told when it is
 * ready and they download it from inside the product within 7 days. Support triggers it and never
 * receives it; the mail carries no link.
 *
 * The server can refuse, and its own sentence is what is shown: no verified email to tell
 * (`email_unverified`), a sign-in email changed by Support in the last 48 hours (`export_on_hold`,
 * with the moment it opens again), or an erasure pending (`conflict`).
 */
export function ExportForm({ result, onCancel }: { result: UserSearchResult; onCancel: () => void }) {
  const exportData = useExportUserData()
  const [reason, setReason] = useState('')
  const [succeeded, setSucceeded] = useState(false)

  if (succeeded) {
    return (
      <div className="flex flex-col gap-sm">
        <p role="status" className="text-body-sm text-success">
          Export queued. {result.name} gets an email at their own verified address when the copy is ready, and
          downloads it from inside the product within 7 days. It is not sent to you.
        </p>
        <div>
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  const error = exportData.error
  const availableAt =
    error instanceof ApiError && error.code === 'export_on_hold' && typeof error.details?.available_at === 'string'
      ? error.details.available_at
      : null

  return (
    <div className="flex flex-col gap-sm">
      <p className="text-caption text-text-secondary">
        Builds a full copy of everything immiNow holds on this user. Their own verified email is told when it is ready
        and they download it from inside the product within 7 days. You do not receive it. Safe to run — it only reads.
      </p>
      <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
      {exportData.isError && (
        <div role="alert" className="flex flex-col gap-0.5">
          <p className="text-body-sm text-error">{exportData.error.message}</p>
          {availableAt && (
            <p className="text-caption text-text-secondary">An export can be requested from {formatDateTime(availableAt)}.</p>
          )}
        </div>
      )}
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

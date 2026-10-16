import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { ServerSearchSelect } from '@/components/ServerSearchSelect'
import { StillNeeded } from '@/components/StillNeeded'
import { TextAreaField } from '@/components/TextAreaField'
import { ClosingNote } from '@/components/ClosingNote'
import { needsAssigningOf } from '@/lib/servedCaseFields'
import { useAssignClient, useReopenClientCase } from '@/queries/clients'
import { activeEmployeeSource } from '@/queries/pickerSources'
import { usePermission } from '@/lib/permissions'
import { showToast } from '@/lib/toast'
import { ApiError } from '@/api/errors'
import { REASON_MIN } from '@/lib/validation'

// A typed reason (at least 3 characters) is required to reopen a case (Phase 8 T2-04, owner's ruling
// 2026-10-13); it is kept in the audit entry. Named "Reopen Case" throughout the UI to stay distinct
// from the existing "Reopen Plan" action (different meaning, different button).

//
// Some closed cases are not the consultancy's to reopen: one a dispute ended, and (gate 12f) one
// that closed because its student deleted their Sentpo account. The server answers those 409
// `closed_by_platform` with a sentence saying so. That sentence is shown, and Reopen is switched
// off, since pressing it again can only get the same answer.
//
// A case that had no consultant when it closed comes back with none (T4-17). Rather than leave it
// in the list unassigned, the box then asks who should take it, right away, for those who may
// assign; everyone else is told to ask an admin.
export function ReopenClientModal({
  clientId,
  clientName,
  assigned = true,
  closingNote = null,
  onClose,
}: {
  clientId: string
  clientName: string
  /** Whether a consultant holds the case now. Without one, reopening goes on to ask who takes it. */
  assigned?: boolean
  /** The note typed when the case was closed (`Client.closing_note`), shown beside the reason box. */
  closingNote?: string | null
  onClose: () => void
}) {
  const reopenClient = useReopenClientCase()
  const canAssign = usePermission('clients.reassign')
  const [reopenedVersion, setReopenedVersion] = useState<number | null | undefined>(undefined)
  const [employeeId, setEmployeeId] = useState('')
  const [reason, setReason] = useState('')
  const reasonOk = reason.trim().length >= REASON_MIN
  const assign = useAssignClient(clientId, reopenedVersion ?? undefined)
  if (reopenedVersion !== undefined) {
    return (
      <Modal
        onClose={onClose}
        title="Case reopened"
        widthRem={26}
        footer={
          <>
            {assign.isError && <p className="mr-auto self-center text-body-sm text-error">{assign.error.message}</p>}
            <Button
              loading={assign.isPending}
              disabled={!employeeId}
              onClick={() =>
                assign.mutate(employeeId, {
                  onSuccess: () => {
                    showToast(`${clientName} assigned`)
                    onClose()
                  },
                })
              }
            >
              Assign
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Not now
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-md">
          <p className="text-body-sm text-text-secondary">
            <strong className="text-text-primary">{clientName}</strong>&rsquo;s case is open again, but no consultant
            holds it yet. Who should take it?
          </p>
          <ServerSearchSelect
            id="reopen-assign-employee"
            label="Consultant"
            required
            source={activeEmployeeSource}
            value={employeeId}
            onChange={(id) => setEmployeeId(id)}
            placeholder="Search by name…"
            emptyText="No one matches that name."
          />
        </div>
      </Modal>
    )
  }
  const refusedForGood = reopenClient.error instanceof ApiError && reopenClient.error.code === 'closed_by_platform'

  return (
    <Modal
      onClose={onClose}
      title="Reopen Case"
      widthRem={26}
      footer={
        <>
          {reopenClient.isError && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {reopenClient.error.message}
            </p>
          )}
          <StillNeeded items={reasonOk ? [] : ['the reason']} />
          <div className="flex gap-sm">
            <Button
              loading={reopenClient.isPending}
              disabled={refusedForGood || !reasonOk}
              onClick={() =>
                reopenClient.mutate({ id: clientId, reason: reason.trim() }, {
                  onSuccess: (result) => {
                    // The answer says whether nobody holds the case (`needs_assigning`); only an
                    // answer that does not say falls back to what the page knew before.
                    const needsAssigning = needsAssigningOf(result) ?? !assigned
                    if (needsAssigning && canAssign) {
                      setReopenedVersion((result as { version?: number } | undefined)?.version ?? null)
                      return
                    }
                    showToast(
                      needsAssigning
                        ? `Case reopened for ${clientName}. No consultant holds it yet, so ask an admin to assign one.`
                        : `Case reopened for ${clientName}`,
                    )
                    onClose()
                  },
                })
              }
            >
              Reopen Case
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          <strong className="text-text-primary">{clientName}</strong> will move back into Clients List.
          {!assigned &&
            (canAssign
              ? ' No consultant holds this case, so you will be asked to choose one next.'
              : ' No consultant holds this case. Ask an admin to assign one afterwards.')}
        </p>
        <ClosingNote note={closingNote} />
        <TextAreaField
          kind="reason"
          label="Reason"
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="Why is this case being reopened? It is kept in the record."
        />
      </div>
    </Modal>
  )
}

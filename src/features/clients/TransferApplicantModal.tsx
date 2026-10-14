import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { ServerSearchSelect } from '@/components/ServerSearchSelect'
import { CaseCarryFields } from '@/components/CaseCarryFields'
import { useTransferApplicant } from '@/queries/clients'
import { useMyConsultancy } from '@/queries/consultancy'
import { consultancySource } from '@/queries/pickerSources'
import { showToast } from '@/lib/toast'
import { DEFAULT_CARRY, movedSentence } from '@/lib/caseCarry'
import { ALREADY_APPLIED_NOTICE, isAlreadyApplied, usePayloadIdempotencyKey } from '@/lib/useIdempotencyKey'

// Cross-consultancy Transfer Applicant (restored 2026-08-20 — user: "Transfer Applicant is
// needed, both to other consultancy and Transfer Consultant also is needed.. Just that Transfer
// Applicant should not be that accessible."). Distinct from Transfer Consultant (in-consultancy
// reassignment on Clients List): this closes the journey as closed_switched and hands the case
// to another consultancy entirely, so it's deliberately buried behind a muted footer link on the
// client Overview, gated by its own permission, and requires typing TRANSFER to confirm.
// GET /consultancies is plain-auth (the student Discovery list) — active ones only, searched on
// the server (F-038); our own consultancy, where the case already lives, is left out of the list.
// Only consultancies are offered: a college or university never receives a transfer (T4-23).
const TRANSFER_TARGETS = consultancySource({ active: true, kind: 'consultancy' })

export function TransferApplicantModal({
  clientId,
  clientName,
  blockedReason = null,
  onClose,
  onTransferred,
}: {
  clientId: string
  clientName: string
  /** Why this case cannot be transferred (`Client.transfer_blocked_reason`), when the server says. */
  blockedReason?: string | null
  onClose: () => void
  onTransferred: () => void
}) {
  const transfer = useTransferApplicant(clientId)
  // One key per opened form and content (review F-297): a retry after a lost reply replays the
  // first answer instead of being refused as already done; edited details are a new transfer.
  const { keyFor, settle } = usePayloadIdempotencyKey()
  const myConsultancy = useMyConsultancy()
  const [newConsultancyId, setNewConsultancyId] = useState('')
  const [reason, setReason] = useState('')
  const [transferCode, setTransferCode] = useState('')
  const [confirmText, setConfirmText] = useState('')
  // What goes with the case: the sender decides (owner's ruling on review I-014, 2026-10-08).
  const [carry, setCarry] = useState(DEFAULT_CARRY)

  const ready =
    Boolean(newConsultancyId) &&
    reason.trim().length > 0 &&
    transferCode.trim().length > 0 &&
    confirmText === 'TRANSFER' &&
    !blockedReason

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    const payload = { newConsultancyId, reason: reason.trim(), transferCode: transferCode.trim().toUpperCase(), carry }
    transfer.mutate(
      { ...payload, idempotencyKey: keyFor(payload) },
      {
        onSuccess: (data) => {
          // What the server says went with the case, not what was ticked.
          showToast(movedSentence(data?.carried))
          onTransferred()
        },
        onError: (err) => {
          settle(err)
          // Already done (the first reply was lost): the case has moved. Say so and leave, never retry.
          if (isAlreadyApplied(err)) {
            showToast(ALREADY_APPLIED_NOTICE)
            onTransferred()
          }
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Transfer Applicant"
      widthRem={30}
      footer={
        <>
          {transfer.isError && !isAlreadyApplied(transfer.error) && <p className="mr-auto self-center text-body-sm text-error">{transfer.error.message}</p>}
          <div className="flex gap-sm">
            <Button
              type="submit"
              form="transfer-applicant-form"
              variant="destructive"
              loading={transfer.isPending}
              disabled={!ready}
            >
              Transfer Applicant
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <form id="transfer-applicant-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        {blockedReason && (
          <p role="alert" className="rounded-md border border-warning bg-warning/10 px-md py-sm text-body-sm text-text-primary">
            {blockedReason}
          </p>
        )}
        <p className="text-body-sm text-text-secondary">
          <strong className="text-text-primary">{clientName}</strong> will be moved to another consultancy. Their case
          here closes as switched and drops out of your Clients List — this cannot be undone from your side. The
          new consultancy opens a new case and receives only what you choose below.
        </p>
        <div className="flex flex-col gap-xs">
          <ServerSearchSelect
            id="transfer-consultancy"
            label="New consultancy"
            source={{ ...TRANSFER_TARGETS, toOption: (c) => ({ id: c.id!, label: c.name, sublabel: c.city ?? undefined }) }}
            exclude={(c) => c.id === myConsultancy.data?.id}
            value={newConsultancyId}
            onChange={setNewConsultancyId}
            placeholder="Search consultancies…"
          />
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="transfer-reason">
            Reason
          </label>
          <textarea
            id="transfer-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this applicant being transferred?"
            className="rounded-md border border-border bg-surface px-3 py-sm text-body"
          />
        </div>
        <CaseCarryFields value={carry} onChange={setCarry} />
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="transfer-code">
            Transfer code
          </label>
          <input
            id="transfer-code"
            value={transferCode}
            onChange={(e) => setTransferCode(e.target.value.toUpperCase())}
            placeholder="e.g. 7F2K9C1A"
            autoComplete="off"
            className="rounded-md border border-border bg-surface px-3 py-sm font-mono text-body uppercase"
          />
          <p className="text-caption text-text-secondary">
            Issued by the receiving consultancy for this student — ask them for one. Their code is their consent to
            accept the case. Codes are single-use and expire after 72 hours.
          </p>
        </div>
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="transfer-confirm">
            Type <span className="font-semibold">TRANSFER</span> to confirm
          </label>
          <input
            id="transfer-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="TRANSFER"
            autoComplete="off"
            className="rounded-md border border-border bg-surface px-3 py-sm text-body"
          />
        </div>
      </form>
    </Modal>
  )
}

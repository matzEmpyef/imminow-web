import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { SearchSelect } from '@/components/SearchSelect'
import { useTransferApplicant } from '@/queries/clients'
import { useMyConsultancy } from '@/queries/consultancy'
import { useAdminConsultancies } from '@/queries/adminConsultancies'

// Cross-consultancy Transfer Applicant (restored 2026-08-20 — user: "Transfer Applicant is
// needed, both to other consultancy and Transfer Consultant also is needed.. Just that Transfer
// Applicant should not be that accessible."). Distinct from Transfer Consultant (in-consultancy
// reassignment on Clients List): this closes the journey as closed_switched and hands the case
// to another consultancy entirely, so it's deliberately buried behind a muted footer link on the
// client Overview, gated by its own permission, and requires typing TRANSFER to confirm.
export function TransferApplicantModal({
  clientId,
  clientName,
  onClose,
  onTransferred,
}: {
  clientId: string
  clientName: string
  onClose: () => void
  onTransferred: () => void
}) {
  const transfer = useTransferApplicant(clientId)
  const myConsultancy = useMyConsultancy()
  // GET /consultancies is plain-auth (the student Discovery list) — active ones only, minus our
  // own consultancy, which is where the case already lives.
  const consultancies = useAdminConsultancies({ active: true, limit: 100 })
  const [newConsultancyId, setNewConsultancyId] = useState('')
  const [reason, setReason] = useState('')
  const [transferCode, setTransferCode] = useState('')
  const [confirmText, setConfirmText] = useState('')

  const options = (consultancies.data?.items ?? [])
    .filter((c) => c.id !== myConsultancy.data?.id)
    .map((c) => ({ id: c.id!, label: c.name, sublabel: c.city ?? undefined }))

  const ready =
    Boolean(newConsultancyId) &&
    reason.trim().length > 0 &&
    transferCode.trim().length > 0 &&
    confirmText === 'TRANSFER'

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    transfer.mutate(
      { newConsultancyId, reason: reason.trim(), transferCode: transferCode.trim().toUpperCase() },
      { onSuccess: onTransferred },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Transfer Applicant"
      widthRem={30}
      footer={
        <>
          {transfer.isError && <p className="mr-auto self-center text-body-sm text-error">{transfer.error.message}</p>}
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
        <p className="text-body-sm text-text-secondary">
          <strong className="text-text-primary">{clientName}</strong> will be moved to another consultancy. Their case
          here closes as switched and drops out of your Clients List — this cannot be undone from your side.
        </p>
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="transfer-consultancy">
            New consultancy
          </label>
          <SearchSelect
            id="transfer-consultancy"
            options={options}
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

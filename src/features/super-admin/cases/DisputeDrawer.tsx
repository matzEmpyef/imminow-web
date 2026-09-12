import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { formatDate } from '@/lib/time'
import {
  useAddDisputeNote,
  useDisputeNotes,
  usePickUpDispute,
  type CaseDispute,
  type DisputeNoteOutcome,
} from '@/queries/disputes'
import { AddNoteForm } from './AddNoteForm'
import { CaseProgressChips } from './CaseProgressChips'
import { DisputeResolveModal } from './DisputeResolveModal'
import { NotesLog } from './NotesLog'
import { OwnerSection } from './OwnerSection'
import { TakeOverConfirmModal } from './TakeOverConfirmModal'
import { RESOLUTION_ACTION_LABELS } from './labels'

const LINK_BUTTON =
  'flex h-8 items-center justify-center whitespace-nowrap rounded-full border border-border bg-surface px-3 text-caption font-medium text-text-primary hover:bg-background'

/**
 * The full dispute record (2026-09-11 rebuild) — contacts for both sides, why it was raised, how
 * far the case had got, ownership, the working notes, and Resolve. Mounted only while a row is
 * selected, same convention as {@link ComplaintDrawer}.
 */
export function DisputeDrawer({
  dispute,
  onClose,
  onUpdated,
}: {
  dispute: CaseDispute
  onClose: () => void
  onUpdated: (updated: CaseDispute) => void
}) {
  const [resolving, setResolving] = useState(false)
  const [confirmingTakeOver, setConfirmingTakeOver] = useState(false)

  const pickUp = usePickUpDispute()
  const notes = useDisputeNotes(dispute.id)
  const addNote = useAddDisputeNote(dispute.id)

  const resolved = dispute.status === 'resolved'

  return (
    <Drawer open onClose={onClose} title={dispute.student_name ?? 'Dispute'} dismissible>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-wrap items-center gap-sm">
          <span className="font-medium text-text-primary">{dispute.student_name}</span>
          <Badge color={resolved ? 'secondary' : 'warning'}>{resolved ? 'Resolved' : 'Open'}</Badge>
        </div>

        {/* Contacts, both sides */}
        <div className="grid grid-cols-2 gap-sm">
          <div className="flex flex-col gap-xs rounded-md border border-border p-sm">
            <p className="text-caption font-medium text-text-secondary">Student</p>
            <p className="text-body-sm text-text-primary">{dispute.student_name}</p>
            {dispute.student_email && (
              <a href={`mailto:${dispute.student_email}`} className="truncate text-caption text-primary hover:underline">
                {dispute.student_email}
              </a>
            )}
            {dispute.student_phone && (
              <a href={`tel:${dispute.student_phone}`} className="text-caption text-primary hover:underline">
                {dispute.student_phone}
              </a>
            )}
          </div>
          <div className="flex flex-col gap-xs rounded-md border border-border p-sm">
            <p className="text-caption font-medium text-text-secondary">Consultancy</p>
            {dispute.consultancy_name ? (
              <Link
                to={`/admin/consultancies?search=${encodeURIComponent(dispute.consultancy_name)}`}
                className="text-body-sm text-primary hover:underline"
              >
                {dispute.consultancy_name}
              </Link>
            ) : (
              <p className="text-body-sm text-text-primary">—</p>
            )}
            {dispute.consultancy_contact?.name && (
              <Link
                to={`/admin/users/imminow?search=${encodeURIComponent(dispute.consultancy_contact.name)}`}
                className="text-caption text-primary hover:underline"
              >
                {dispute.consultancy_contact.name}
              </Link>
            )}
            {dispute.consultancy_contact?.email && (
              <a
                href={`mailto:${dispute.consultancy_contact.email}`}
                className="truncate text-caption text-primary hover:underline"
              >
                {dispute.consultancy_contact.email}
              </a>
            )}
            {dispute.consultancy_contact?.phone && (
              <a href={`tel:${dispute.consultancy_contact.phone}`} className="text-caption text-primary hover:underline">
                {dispute.consultancy_contact.phone}
              </a>
            )}
          </div>
        </div>

        {/* Reason */}
        <div className="flex flex-col gap-xs">
          <p className="text-caption font-medium text-text-secondary">
            {dispute.raised_by === 'consultancy'
              ? `Raised by the consultancy · ${dispute.raised_by_name ?? 'staff'}`
              : 'Raised by the student'}
          </p>
          <p className="whitespace-pre-wrap rounded-md bg-background p-sm text-body-sm text-text-primary">
            {dispute.reason}
          </p>
        </div>

        {dispute.complaint_id && (
          <div className="flex flex-wrap items-center justify-between gap-sm rounded-md bg-info/10 px-md py-sm text-body-sm text-info">
            <span>From a student complaint.</span>
            <Link to="/admin/complaints" className="font-medium underline">
              Open in Complaints
            </Link>
          </div>
        )}

        {/* Case */}
        <div className="flex flex-col gap-sm">
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <p className="text-caption font-medium text-text-secondary">Case</p>
            {dispute.journey_id && (
              <Link to={`/admin/applicants/${dispute.journey_id}`} className={LINK_BUTTON}>
                Open case
              </Link>
            )}
          </div>
          <CaseProgressChips progress={dispute.case_progress} />
        </div>

        {/* Owner */}
        <OwnerSection
          assignedToName={dispute.assigned_to_name}
          pickedUpAt={dispute.picked_up_at}
          pending={pickUp.isPending}
          readOnly={resolved}
          onPickUp={() => pickUp.mutate(dispute.id, { onSuccess: (updated) => updated && onUpdated(updated) })}
          onTakeOver={() => setConfirmingTakeOver(true)}
        />

        {/* Notes */}
        {!resolved && (
          <AddNoteForm
            pending={addNote.isPending}
            errorMessage={addNote.isError ? addNote.error.message : undefined}
            onAdd={(note, outcome) => addNote.mutate({ note, outcome: outcome as DisputeNoteOutcome | undefined })}
          />
        )}
        <NotesLog
          notes={notes.data?.items}
          loading={notes.isLoading}
          error={notes.isError}
          onRetry={() => notes.refetch()}
        />

        {resolved ? (
          <div className="flex flex-col gap-xs rounded-md bg-success/10 px-md py-sm">
            <p className="text-body-sm font-medium text-text-primary">
              {(dispute.resolution_action && RESOLUTION_ACTION_LABELS[dispute.resolution_action]) ?? 'Resolved'}
            </p>
            <p className="whitespace-pre-wrap text-body-sm text-text-primary">{dispute.resolution_note}</p>
            <p className="text-caption text-text-secondary">
              {dispute.resolved_by_name ?? 'Someone'}
              {dispute.resolved_at ? ` · ${formatDate(dispute.resolved_at)}` : ''}
            </p>
            {dispute.reassign_pending && (
              <div className="mt-xs flex flex-wrap items-center justify-between gap-sm rounded-md bg-warning/10 px-md py-sm text-body-sm text-warning">
                <span>Waiting in Applicant Allocation.</span>
                <Link to="/admin/applicant-allocation" className="font-medium underline">
                  Open queue
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="flex justify-end pt-sm">
            <Button onClick={() => setResolving(true)}>Resolve</Button>
          </div>
        )}
      </div>

      {resolving && (
        <DisputeResolveModal dispute={dispute} onClose={() => setResolving(false)} onResolved={onUpdated} />
      )}
      {confirmingTakeOver && (
        <TakeOverConfirmModal
          ownerName={dispute.assigned_to_name ?? 'them'}
          loading={pickUp.isPending}
          error={pickUp.isError ? pickUp.error.message : undefined}
          onClose={() => setConfirmingTakeOver(false)}
          onConfirm={() =>
            pickUp.mutate(dispute.id, {
              onSuccess: (updated) => {
                setConfirmingTakeOver(false)
                if (updated) onUpdated(updated)
              },
            })
          }
        />
      )}
    </Drawer>
  )
}

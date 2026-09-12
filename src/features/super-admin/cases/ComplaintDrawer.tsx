import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { formatDate, formatDateTime } from '@/lib/time'
import {
  useAddComplaintNote,
  useComplaintNotes,
  useUpdateComplaint,
  type Complaint,
  type ComplaintNoteOutcome,
} from '@/queries/complaints'
import { AddNoteForm } from './AddNoteForm'
import { ComplaintEscalateModal } from './ComplaintEscalateModal'
import { ComplaintResolveModal } from './ComplaintResolveModal'
import { NotesLog } from './NotesLog'
import { OwnerSection } from './OwnerSection'
import { TakeOverConfirmModal } from './TakeOverConfirmModal'
import { CATEGORY_LABELS, COMPLAINT_STATUS_META } from './labels'

const LINK_BUTTON =
  'flex h-8 items-center justify-center whitespace-nowrap rounded-full border border-border bg-surface px-3 text-caption font-medium text-text-primary hover:bg-background'

/**
 * The full complaint record (2026-09-11 rebuild) — how to reach the student, the case it's on,
 * what they reported, who owns it, the working notes, and the resolve/escalate actions. Mounted
 * only while a row is selected (parent renders `{viewing && <ComplaintDrawer .../>}`), so every
 * hook below can assume `complaint` is real for the component's whole lifetime.
 */
export function ComplaintDrawer({
  complaint,
  onClose,
  onUpdated,
}: {
  complaint: Complaint
  onClose: () => void
  onUpdated: (updated: Complaint) => void
}) {
  const [escalating, setEscalating] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [confirmingTakeOver, setConfirmingTakeOver] = useState(false)

  const update = useUpdateComplaint(complaint.id)
  const notes = useComplaintNotes(complaint.id)
  const addNote = useAddComplaintNote(complaint.id)

  const statusMeta = COMPLAINT_STATUS_META[complaint.status]
  const resolved = complaint.status === 'resolved'

  return (
    <Drawer open onClose={onClose} title={complaint.student_name ?? 'Complaint'} dismissible>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-wrap items-center gap-sm">
          <span className="font-medium text-text-primary">{complaint.student_name}</span>
          <Badge color={statusMeta?.color ?? 'info'}>{statusMeta?.label ?? complaint.status}</Badge>
        </div>

        {/* 1. How to reach them */}
        <div className="flex flex-col gap-sm">
          <p className="text-caption font-medium text-text-secondary">How to reach them</p>
          {complaint.preferred_contact_mode && (
            <Badge color="info" className="w-fit">
              {complaint.preferred_contact_mode === 'call' ? 'Prefers a call' : 'Prefers email'}
              {complaint.preferred_contact_value ? ` · ${complaint.preferred_contact_value}` : ''}
            </Badge>
          )}
          <div className="flex flex-col gap-xs text-body-sm">
            {complaint.email && (
              <a href={`mailto:${complaint.email}`} className="text-primary hover:underline">
                {complaint.email}
              </a>
            )}
            {complaint.phone && (
              <a href={`tel:${complaint.phone}`} className="text-primary hover:underline">
                {complaint.phone}
              </a>
            )}
          </div>
        </div>

        {/* 2. Case */}
        <div className="flex flex-col gap-sm">
          <p className="text-caption font-medium text-text-secondary">Case</p>
          <div className="flex flex-wrap items-center justify-between gap-sm">
            {complaint.consultancy_name ? (
              <Link
                to={`/admin/consultancies?search=${encodeURIComponent(complaint.consultancy_name)}`}
                className="text-body-sm text-primary hover:underline"
              >
                {complaint.consultancy_name}
              </Link>
            ) : (
              <span className="text-body-sm text-text-primary">— (no active case)</span>
            )}
            {complaint.journey_id && (
              <Link to={`/admin/applicants/${complaint.journey_id}`} className={LINK_BUTTON}>
                Open case
              </Link>
            )}
          </div>
          {complaint.consultancy_change_requested && (
            <div className="flex flex-wrap items-center justify-between gap-sm rounded-md bg-warning/10 px-md py-sm text-body-sm text-warning">
              <span>Asked to move to another consultancy.</span>
              <Link to="/admin/applicant-allocation" className="font-medium underline">
                Applicant Allocation
              </Link>
            </div>
          )}
          {complaint.dispute_id && (
            <div className="flex flex-wrap items-center justify-between gap-sm rounded-md bg-info/10 px-md py-sm text-body-sm text-info">
              <span>{complaint.dispute_status === 'resolved' ? 'Dispute resolved.' : 'In dispute — case is paused.'}</span>
              <Link to={`/admin/disputes?id=${complaint.dispute_id}`} className="font-medium underline">
                Open in Disputes
              </Link>
            </div>
          )}
        </div>

        {/* 3. What they reported */}
        <div className="flex flex-col gap-xs">
          <p className="text-caption font-medium text-text-secondary">
            What they reported · {CATEGORY_LABELS[complaint.category] ?? complaint.category}
          </p>
          <p className="whitespace-pre-wrap rounded-md bg-background p-sm text-body-sm text-text-primary">
            {complaint.description}
          </p>
          <p className="text-caption text-text-secondary">Submitted {formatDateTime(complaint.created_at)}</p>
        </div>

        {/* 4. Owner */}
        <OwnerSection
          assignedToName={complaint.assigned_to_name}
          pickedUpAt={complaint.picked_up_at}
          pending={update.isPending}
          readOnly={resolved}
          onPickUp={() =>
            update.mutate({ status: 'in_review' }, { onSuccess: (updated) => updated && onUpdated(updated) })
          }
          onTakeOver={() => setConfirmingTakeOver(true)}
        />

        {/* 5. Notes */}
        {!resolved && (
          <AddNoteForm
            pending={addNote.isPending}
            errorMessage={addNote.isError ? addNote.error.message : undefined}
            onAdd={(note, outcome) =>
              addNote.mutate({ note, outcome: outcome as ComplaintNoteOutcome | undefined })
            }
          />
        )}
        <NotesLog
          notes={notes.data?.items}
          loading={notes.isLoading}
          error={notes.isError}
          onRetry={() => notes.refetch()}
        />

        {/* 7. Resolved summary */}
        {resolved && (
          <div className="flex flex-col gap-xs rounded-md bg-success/10 px-md py-sm">
            <p className="text-body-sm font-medium text-text-primary">Resolution</p>
            <p className="whitespace-pre-wrap text-body-sm text-text-primary">{complaint.resolution_note}</p>
            <p className="text-caption text-text-secondary">
              Resolved by {complaint.resolved_by_name ?? 'someone'}
              {complaint.resolved_at ? ` on ${formatDate(complaint.resolved_at)}` : ''}
            </p>
          </div>
        )}

        {/* 6. Footer actions */}
        {!resolved && (
          <div className="flex flex-wrap gap-sm pt-sm">
            {complaint.journey_id && !complaint.dispute_id && (
              <Button variant="secondary" onClick={() => setEscalating(true)}>
                Escalate to dispute
              </Button>
            )}
            <Button
              disabled={complaint.dispute_status === 'open'}
              onClick={() => setResolving(true)}
            >
              Resolve
            </Button>
            {complaint.dispute_status === 'open' && (
              <p className="w-full text-caption text-text-secondary">
                Resolve the dispute — this complaint closes with it.
              </p>
            )}
          </div>
        )}
      </div>

      {escalating && (
        <ComplaintEscalateModal
          complaint={complaint}
          onClose={() => setEscalating(false)}
          onEscalated={onUpdated}
        />
      )}
      {resolving && (
        <ComplaintResolveModal complaint={complaint} onClose={() => setResolving(false)} onResolved={onUpdated} />
      )}
      {confirmingTakeOver && (
        <TakeOverConfirmModal
          ownerName={complaint.assigned_to_name ?? 'them'}
          loading={update.isPending}
          error={update.isError ? update.error.message : undefined}
          onClose={() => setConfirmingTakeOver(false)}
          onConfirm={() =>
            update.mutate(
              { assign_to_me: true },
              {
                onSuccess: (updated) => {
                  setConfirmingTakeOver(false)
                  if (updated) onUpdated(updated)
                },
              },
            )
          }
        />
      )}
    </Drawer>
  )
}

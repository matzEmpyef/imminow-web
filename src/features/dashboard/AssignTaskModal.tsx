import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { ServerSearchSelect } from '@/components/ServerSearchSelect'
import { useAssignActivityTask } from '@/queries/activity'
import { activeEmployeeSource, employeeName, personSource, type Employee, type PersonRow } from '@/queries/pickerSources'
import { showToast } from '@/lib/toast'

// User-requested (2026-08-15) — "Assign Task needs to be a popup... Also the client selection...
// It could be a lead too... also we need to search the client/lead name in Related client
// (optional)." Extracted from ActivityPage.tsx's inline expanding Card into a real Modal;
// "Related client" is now "Related client or lead," a single searchable field spanning both
// lists (mirroring GlobalSearch's own Applicant/Lead tagging) instead of a client-only <select>.
export function AssignTaskModal({ onClose }: { onClose: () => void }) {
  // Shared with Course Finder through `personSource` — one definition of "every applicant, every
  // active allocated lead", searched on the server (F-038) rather than two capped pages.
  const [related, setRelated] = useState<PersonRow>()
  const assignTask = useAssignActivityTask()

  const [relatedId, setRelatedId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  // The colleague chosen, searched on the server (review F-036, lane x); kept for the confirmation.
  const [assignee, setAssignee] = useState<Employee>()
  const [note, setNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  // Optional, unlike the self-assigned lead-reminder flow's required due_time (2026-08-29
  // parity addition) — a task handed to a teammate doesn't need a time-of-day the way a
  // self-assigned reminder does.
  const [dueTime, setDueTime] = useState('')

  const isRelatedLead = related?.kind === 'lead'

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!assignedTo || !note || !dueDate) return
    const assigneeName = assignee ? employeeName(assignee) : undefined
    assignTask.mutate(
      {
        journey_id: relatedId && !isRelatedLead ? relatedId : undefined,
        lead_id: relatedId && isRelatedLead ? relatedId : undefined,
        assigned_to: assignedTo,
        note,
        due_date: dueDate,
        due_time: dueTime || undefined,
      },
      {
        onSuccess: () => {
          showToast(assigneeName ? `Task assigned to ${assigneeName}` : 'Task assigned')
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Assign Task"
      widthRem={30}
      footer={
        <>
          {assignTask.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{assignTask.error.message}</p>
          )}
          <Button
            type="submit"
            form="assign-task-form"
            loading={assignTask.isPending}
            disabled={!assignedTo || !note || !dueDate}
          >
            Assign
          </Button>
        </>
      }
    >
      <form id="assign-task-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <div className="flex flex-col gap-xs">
          <ServerSearchSelect
            id="task-related"
            label="Related client or lead"
            source={personSource}
            value={relatedId}
            onChange={(id, person) => {
              setRelatedId(id)
              setRelated(person)
            }}
            placeholder="Search applicants and leads…"
          />
        </div>
        <ServerSearchSelect
          label="Assign to"
          required
          id="task-assignee"
          source={activeEmployeeSource}
          value={assignedTo}
          onChange={(id, employee) => {
            setAssignedTo(id)
            setAssignee(employee)
          }}
          placeholder="Search by name…"
          emptyText="No one matches that name."
        />
        <TextField label="Note" required value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="grid grid-cols-2 gap-md">
          <TextField
            label="Due date"
            type="date"
            required
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <TextField
            label="Due time (optional)"
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  )
}

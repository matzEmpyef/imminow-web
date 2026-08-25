import { useState, type FormEvent } from 'react'
import { SelectField } from '@/components/SelectField'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { SearchSelect } from '@/components/SearchSelect'
import { useAssignActivityTask } from '@/queries/activity'
import { useEmployees } from '@/queries/staff'
import { usePersonPicker } from '@/lib/usePersonPicker'

// User-requested (2026-08-15) — "Assign Task needs to be a popup... Also the client selection...
// It could be a lead too... also we need to search the client/lead name in Related client
// (optional)." Extracted from ActivityPage.tsx's inline expanding Card into a real Modal;
// "Related client" is now "Related client or lead," a single searchable field spanning both
// lists (mirroring GlobalSearch's own Applicant/Lead tagging) instead of a client-only <select>.
export function AssignTaskModal({ onClose }: { onClose: () => void }) {
  const employees = useEmployees()
  // Shared with CourseFinderPage.tsx via usePersonPicker() (2026-08-24) — this field used to
  // fetch and filter the same applicant/lead lists as its own copy, and a fix applied to one
  // (page size, case_type, allocation) silently didn't reach the other. See that hook's comment.
  const { clientRows, leadRows } = usePersonPicker()
  const assignTask = useAssignActivityTask()

  const [relatedId, setRelatedId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [note, setNote] = useState('')
  const [dueDate, setDueDate] = useState('')

  const isRelatedLead = leadRows.some((l) => l.id === relatedId)
  const relatedOptions = [
    { id: '', label: 'None' },
    ...clientRows.map((c) => ({
      id: c.id,
      label: `${c.student.first_name} ${c.student.last_name}`,
      group: 'Applicant',
    })),
    ...leadRows.map((l) => ({
      id: l.id,
      label: l.name,
      group: 'Lead',
    })),
  ]

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!assignedTo || !note || !dueDate) return
    assignTask.mutate(
      {
        journey_id: relatedId && !isRelatedLead ? relatedId : undefined,
        lead_id: relatedId && isRelatedLead ? relatedId : undefined,
        assigned_to: assignedTo,
        note,
        due_date: dueDate,
      },
      { onSuccess: onClose },
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
          <label className="text-body-sm font-medium text-text-primary" htmlFor="task-related">
            Related client or lead
          </label>
          <SearchSelect
            id="task-related"
            options={relatedOptions}
            value={relatedId}
            onChange={setRelatedId}
            placeholder="Search applicants and leads…"
          />
        </div>
        <SelectField
          label="Assign to"
          required
          id="task-assignee"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
        >
          <option value="">Select…</option>
          {employees.data?.items.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.user!.first_name} {emp.user!.last_name}
            </option>
          ))}
        </SelectField>
        <TextField label="Note" required value={note} onChange={(e) => setNote(e.target.value)} />
        <TextField label="Due date" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </form>
    </Modal>
  )
}

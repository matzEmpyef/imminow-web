import { useState } from 'react'
import { servedHandoverCount } from '@/lib/servedHandoverCount'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { ServerSearchSelect } from '@/components/ServerSearchSelect'
import { activeEmployeeSource } from '@/queries/pickerSources'
import { useDisableEmployee } from '@/queries/staff'
import { employeeStanding } from '@/lib/employeeStanding'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'

type Employee = components['schemas']['Employee']

/**
 * The confirmation for taking a person off the team, on every plan (phase 8, T1-13): "Disable" for
 * someone who works here, "Withdraw invitation" for someone who has not joined yet. Both are the
 * same call (`DELETE /staff/employees/{id}`) and both free the seat at once; only the words and the
 * question differ. Shared by the row's own control and by the Manage Access dialog, so there is one
 * dialog and not two that drift apart.
 */
export function DisableEmployeeDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const disableEmployee = useDisableEmployee()
  const [successorId, setSuccessorId] = useState('')
  const invited = employeeStanding(employee) === 'invited'
  // Only asked for when they actually hold some — the server's own rule, mirrored here so the
  // dialog isn't padded with an irrelevant field.
  // `assigned_work_count` counts leads, clients and tasks. If the server still asks for a successor
  // (something was given to them since this list was read), its own count is used and its sentence
  // stays in the footer.
  const assignedWork = Math.max(employee.assigned_work_count ?? 0, servedHandoverCount(disableEmployee.error))
  const name = `${employee.user!.first_name} ${employee.user!.last_name}`
  const action = invited ? 'Withdraw invitation' : 'Disable'

  return (
    <Modal
      onClose={onClose}
      title={invited ? 'Withdraw Invitation' : 'Disable Employee'}
      widthRem={24}
      footer={
        <>
          {disableEmployee.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{disableEmployee.error.message}</p>
          )}
          <div className="flex justify-end gap-sm">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={disableEmployee.isPending}
              disabled={assignedWork > 0 && !successorId}
              onClick={() =>
                disableEmployee.mutate(
                  { id: employee.id!, reassign_to_employee_id: successorId || undefined },
                  {
                    onSuccess: () => {
                      showToast(invited ? `Invitation to ${name} withdrawn` : `${name} disabled`)
                      onClose()
                    },
                  },
                )
              }
            >
              {action}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        {invited ? (
          <p className="text-body-sm text-text-secondary">
            Withdraw the invitation to <span className="font-medium text-text-primary">{name}</span>? The link in their
            email will stop working and the seat is free again straight away. You can invite them again later.
          </p>
        ) : (
          <p className="text-body-sm text-text-secondary">
            Disable <span className="font-medium text-text-primary">{name}</span>? They'll lose access immediately —
            their session stops working and they can't sign back in.
          </p>
        )}
        {assignedWork > 0 && (
          <div className="flex flex-col gap-xs">
            <p className="text-body-sm font-medium text-text-primary">
              Hand over their {assignedWork} open item{assignedWork === 1 ? '' : 's'} (leads, clients and tasks) to
            </p>
            {/* Searched on the server (review F-036, lane x): anyone who works here now, never
                the person being disabled. */}
            <ServerSearchSelect
              id={`successor-${employee.id}`}
              label="Reassign to"
              required
              source={activeEmployeeSource}
              value={successorId}
              onChange={(id) => setSuccessorId(id)}
              exclude={(e) => e.id === employee.id}
              placeholder="Search by name…"
              emptyText="No one matches that name."
            />
            <p className="text-caption text-text-secondary">
              Work left on a disabled account shows up on nobody's list, so this can't be skipped.
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}

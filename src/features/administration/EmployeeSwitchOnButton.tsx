import { useState } from 'react'
import { UserCheck } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useReactivateEmployee } from '@/queries/staff'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'

type Employee = components['schemas']['Employee']

/**
 * The row control that switches a disabled person back on (Phase 8 T2-03). They sign in again with
 * the designation and permissions they had; the leads and clients handed over when they were
 * disabled stay with whoever took them. A person who never accepted their invitation cannot be
 * switched back on: the server refuses with its own sentence (shown as it is served), which says to
 * send a new invitation instead.
 */
export function EmployeeSwitchOnButton({ employee }: { employee: Employee }) {
  const [open, setOpen] = useState(false)
  const name = `${employee.user!.first_name} ${employee.user!.last_name}`
  return (
    <div className="contents">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Switch ${name} back on`}
        title="Switch back on"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-success/10 hover:text-success"
      >
        <UserCheck className="h-4 w-4" />
      </button>
      {open && <SwitchOnDialog employee={employee} name={name} onClose={() => setOpen(false)} />}
    </div>
  )
}

function SwitchOnDialog({ employee, name, onClose }: { employee: Employee; name: string; onClose: () => void }) {
  const reactivate = useReactivateEmployee()
  return (
    <Modal
      onClose={onClose}
      title="Switch Back On"
      widthRem={24}
      footer={
        <>
          {reactivate.isError && <p className="mr-auto self-center text-body-sm text-error">{reactivate.error.message}</p>}
          <div className="flex justify-end gap-sm">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              loading={reactivate.isPending}
              onClick={() =>
                reactivate.mutate(employee.id!, {
                  onSuccess: () => {
                    showToast(`${name} switched back on`)
                    onClose()
                  },
                })
              }
            >
              Switch back on
            </Button>
          </div>
        </>
      }
    >
      <p className="text-body-sm text-text-secondary">
        Switch <span className="font-medium text-text-primary">{name}</span> back on? They can sign in again with the
        access they had. The leads and clients handed over when they were disabled stay with the people who took them.
      </p>
    </Modal>
  )
}

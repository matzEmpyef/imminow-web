import { useState } from 'react'
import { MailX, UserX } from 'lucide-react'
import { DisableEmployeeDialog } from './DisableEmployeeDialog'
import { employeeStanding } from '@/lib/employeeStanding'
import type { components } from '@/api/schema'

type Employee = components['schemas']['Employee']

/**
 * The row control that takes a person off the team: Disable for someone who works here, Withdraw
 * invitation for someone who has not joined. On every plan (T1-13): it used to live only inside
 * Manage Access, which Starter does not have, so a Starter admin could not remove anyone. Not shown
 * for the owner, for the person using the console, or for someone already switched off; whether the
 * caller may remove this particular colleague is the server's to say.
 */
export function EmployeeRemoveButton({ employee }: { employee: Employee }) {
  const [open, setOpen] = useState(false)
  const invited = employeeStanding(employee) === 'invited'
  const name = `${employee.user!.first_name} ${employee.user!.last_name}`
  const label = invited ? `Withdraw invitation for ${name}` : `Disable ${name}`
  const Icon = invited ? MailX : UserX
  return (
    <div className="contents">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={invited ? 'Withdraw invitation' : 'Disable'}
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-error/10 hover:text-error"
      >
        <Icon className="h-4 w-4" />
      </button>
      {open && <DisableEmployeeDialog employee={employee} onClose={() => setOpen(false)} />}
    </div>
  )
}

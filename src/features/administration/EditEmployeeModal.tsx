import { useState, type FormEvent } from 'react'
import { Pencil } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useUpdateEmployee } from '@/queries/staff'
import { PHONE_ERROR, isValidPhone } from '@/lib/validation'
import type { components } from '@/api/schema'

type Employee = components['schemas']['Employee']

// User-requested (2026-08-15) — a separate, lightweight Edit popup for name/phone/designation
// (the free-text job title), distinct from Manage Access which stays the sensitive-change path
// (branch(es), Access Rights, permission overrides — reason required). Mirrors
// InviteEmployeeModal.tsx's shape.
export function EditEmployeeModal({ employee }: { employee: Employee }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="contents">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${employee.user!.first_name} ${employee.user!.last_name}`}
        title="Edit"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Pencil className="h-4 w-4" />
      </button>
      {open && <EditEmployeeModalBody employee={employee} onClose={() => setOpen(false)} />}
    </div>
  )
}

function EditEmployeeModalBody({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const updateEmployee = useUpdateEmployee(employee.id!)
  const [firstName, setFirstName] = useState(employee.user!.first_name)
  const [lastName, setLastName] = useState(employee.user!.last_name)
  const [phone, setPhone] = useState(employee.user!.phone ?? '')
  const [designation, setDesignation] = useState(employee.user!.designation ?? '')

  const phoneError = phone && !isValidPhone(phone) ? PHONE_ERROR : undefined
  const canSave = Boolean(firstName && lastName) && !phoneError

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
    updateEmployee.mutate(
      {
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
        designation: designation || null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={`Edit ${employee.user!.first_name} ${employee.user!.last_name}`}
      widthRem={28}
      footer={
        <>
          {updateEmployee.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updateEmployee.error.message}</p>
          )}
          <Button type="submit" form="edit-employee-form" loading={updateEmployee.isPending} disabled={!canSave}>
            Save Changes
          </Button>
        </>
      }
    >
      <form id="edit-employee-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <div className="grid grid-cols-2 gap-md">
          <TextField label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <TextField label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <TextField
          label="Phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={phoneError}
        />
        <TextField
          label="Designation"
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
          placeholder="e.g. Senior Consultant"
        />
      </form>
    </Modal>
  )
}

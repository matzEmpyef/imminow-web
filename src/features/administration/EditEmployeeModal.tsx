import { useState, type FormEvent } from 'react'
import { Pencil } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { useUpdateEmployee } from '@/queries/staff'
import { cleanName, isTextOk, phoneError as checkPhone, phoneToSend } from '@/lib/validation'
import { usePhoneRegion } from '@/lib/phoneRegion'
import { useServerFieldErrors } from '@/lib/useServerFieldErrors'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'

type Employee = components['schemas']['Employee']
type Designation = components['schemas']['Designation']

// User-requested (2026-08-15) — a separate, lightweight Edit popup for name/phone/designation
// (the job title, picked from the consultancy's designations since console review M6,
// 2026-09-13), distinct from Manage Access which stays the sensitive-change path (branch(es),
// Access Rights, permission overrides — reason required). Mirrors InviteEmployeeModal.tsx's shape.
export function EditEmployeeModal({
  employee,
  designations,
  hasDesignations = true,
  hasAccessControls = true,
}: {
  employee: Employee
  designations: Designation[]
  /** The plan has access rights (designations). Without them everyone has full access. */
  hasDesignations?: boolean
  /** The row has a Manage Access control at all: access rights, or branches to put people in. */
  hasAccessControls?: boolean
}) {
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
      {open && (
        <EditEmployeeModalBody
          employee={employee}
          designations={designations}
          hasDesignations={hasDesignations}
          hasAccessControls={hasAccessControls}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function EditEmployeeModalBody({
  employee,
  designations,
  hasDesignations,
  hasAccessControls,
  onClose,
}: {
  employee: Employee
  designations: Designation[]
  hasDesignations: boolean
  hasAccessControls: boolean
  onClose: () => void
}) {
  const updateEmployee = useUpdateEmployee(employee.id!, employee.version)
  const [firstName, setFirstName] = useState(employee.user!.first_name)
  const [lastName, setLastName] = useState(employee.user!.last_name)
  const [phone, setPhone] = useState(employee.user!.phone ?? '')
  // A select over the consultancy's own designations, not free text (console review M6,
  // 2026-09-13) — the same list Invite now uses, so the two forms cannot disagree about what a
  // designation is called. Keyed on the NAME rather than the id: this modal writes the job title
  // only (`designation`), never `designation_id` — changing access rights stays behind Manage
  // Access, which requires a reason and is audited as such. A title recorded before this list
  // existed is kept as its own option so a save from here can't quietly erase it.
  const [designation, setDesignation] = useState(employee.user!.designation ?? '')
  const legacyTitle =
    employee.user!.designation && !designations.some((d) => d.name === employee.user!.designation)
      ? employee.user!.designation
      : null

  const region = usePhoneRegion()
  // A number saved before the rule was one is not flagged until someone edits it.
  const phoneError = phone !== (employee.user!.phone ?? '') ? checkPhone(phone, region) : undefined
  const server = useServerFieldErrors(updateEmployee.error, { first_name: firstName, last_name: lastName, phone })
  const canSave = isTextOk('name', firstName) && isTextOk('name', lastName) && !phoneError

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
    updateEmployee.mutate(
      {
        first_name: cleanName(firstName),
        last_name: cleanName(lastName),
        phone: phone.trim() ? (phone === (employee.user!.phone ?? '') ? phone.trim() : phoneToSend(phone, region)) : null,
        designation: designation || null,
      },
      {
        onSuccess: () => {
          showToast(`${firstName} ${lastName} updated`)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={`Edit ${employee.user!.first_name} ${employee.user!.last_name}`}
      widthRem={28}
      footer={
        <>
          {updateEmployee.isError && !server.allBesideFields && (
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
          <TextField
            kind="name"
            label="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={server.messageFor('first_name')}
          />
          <TextField
            kind="name"
            label="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            error={server.messageFor('last_name')}
          />
        </div>
        <TextField
          label="Phone"
          type="tel"
          autoCheck={false}
          phoneRegion={region}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={phoneError ?? server.messageFor('phone')}
        />
        <SelectField
          label="Designation"
          id={`edit-employee-designation-${employee.id}`}
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
        >
          <option value="">Select…</option>
          {legacyTitle && <option value={legacyTitle}>{legacyTitle} (current)</option>}
          {designations.map((d) => (
            <option key={d.id} value={d.name}>
              {d.name}
            </option>
          ))}
        </SelectField>
        {/* Points only at what exists on this plan (T1-13): Starter has no Manage Access. */}
        <p className="text-caption text-text-secondary">
          {hasDesignations
            ? 'Access rights are changed under Manage Access, which asks for a reason.'
            : hasAccessControls
              ? 'Branches are changed under Manage Access.'
              : 'Everyone on this plan has full access, so there are no access rights to change.'}
        </p>
      </form>
    </Modal>
  )
}

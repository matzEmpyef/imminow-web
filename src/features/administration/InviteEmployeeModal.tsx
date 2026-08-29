import { useState, type FormEvent } from 'react'
import { SelectField } from '@/components/SelectField'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useInviteEmployee } from '@/queries/staff'
import { EMAIL_ERROR, PHONE_ERROR, isValidEmail, isValidPhone } from '@/lib/validation'
import type { components } from '@/api/schema'

type Designation = components['schemas']['Designation']

// User-requested — was an inline Card+form toggled below the page header, same move already
// made for Create Applicant/Add Lead elsewhere this session.
export function InviteEmployeeModal({
  hasDesignations,
  designations,
  onClose,
}: {
  hasDesignations: boolean
  designations: Designation[]
  onClose: () => void
}) {
  const inviteEmployee = useInviteEmployee()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [designation, setDesignation] = useState('')
  const [designationId, setDesignationId] = useState('')

  const emailError = email && !isValidEmail(email) ? EMAIL_ERROR : undefined
  const phoneError = phone && !isValidPhone(phone) ? PHONE_ERROR : undefined
  const canInvite = Boolean(firstName && lastName && email) && !emailError && !phoneError

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canInvite) return
    inviteEmployee.mutate(
      {
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || undefined,
        designation: designation || undefined,
        designation_id: hasDesignations ? designationId || undefined : undefined,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Invite Employee"
      widthRem={28}
      footer={
        <>
          {inviteEmployee.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{inviteEmployee.error.message}</p>
          )}
          <Button type="submit" form="invite-employee-form" loading={inviteEmployee.isPending} disabled={!canInvite}>
            Send Invite
          </Button>
        </>
      }
    >
      <form id="invite-employee-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <div className="grid grid-cols-2 gap-md">
          <TextField label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <TextField label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
        />
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
        {hasDesignations && (
          <SelectField
            label="Access Rights"
            id="invite-designation"
            value={designationId}
            onChange={(e) => setDesignationId(e.target.value)}
          >
            <option value="">Select…</option>
            {designations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectField>
        )}
      </form>
    </Modal>
  )
}

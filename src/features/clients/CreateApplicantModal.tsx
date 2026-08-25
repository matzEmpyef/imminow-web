import { useState, type FormEvent } from 'react'
import { SelectField } from '@/components/SelectField'
import { useNavigate } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useEmployees } from '@/queries/staff'
import { useCreateApplicant } from '@/queries/clients'
import { EMAIL_ERROR, PHONE_ERROR, isValidEmail, isValidPhone } from '@/lib/validation'

// Was its own page (`/clients/new`) — folded into Clients List as a popup (user-requested),
// same move already made for Import Leads/Add Lead on Lead Pool (see ImportLeadsModal.tsx).
// ClientsListPage decides whether to render the trigger button at all (tier gate), so this modal
// assumes it's already allowed to be open.
export function CreateApplicantModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const employees = useEmployees()
  const createApplicant = useCreateApplicant()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [caseType, setCaseType] = useState<'student' | 'pr'>('student')
  const [employeeId, setEmployeeId] = useState('')

  const phoneError = phone && !isValidPhone(phone) ? PHONE_ERROR : undefined
  const emailError = email && !isValidEmail(email) ? EMAIL_ERROR : undefined
  const canSubmit = Boolean(firstName && lastName && email && employeeId) && !phoneError && !emailError

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    createApplicant.mutate(
      {
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        address: address || null,
        case_type: caseType,
        assigned_employee_id: employeeId,
      },
      { onSuccess: (data) => navigate(`/clients/${data?.id}`) },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Create Applicant"
      widthRem={36}
      footer={
        <>
          {createApplicant.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{createApplicant.error.message}</p>
          )}
          <Button type="submit" form="create-applicant-form" loading={createApplicant.isPending} disabled={!canSubmit}>
            Create Applicant
          </Button>
        </>
      }
    >
      <form id="create-applicant-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
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
        <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} error={phoneError} />
        <TextField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />

        {/* fieldset/legend is the correct grouping for a radio set — a bare <label> can't
            associate with two inputs at once. The border/margin/padding resets keep the visual
            output identical to the plain divs this replaced. */}
        <fieldset className="flex flex-col gap-xs border-0 p-0">
          <legend className="mb-xs p-0 text-body-sm font-medium text-text-primary">Applicant Type</legend>
          <div className="flex gap-md">
            <label className="flex items-center gap-xs text-body-sm">
              <input
                type="radio"
                name="applicant-type"
                checked={caseType === 'student'}
                onChange={() => setCaseType('student')}
              />
              Student
            </label>
            <label className="flex items-center gap-xs text-body-sm">
              <input
                type="radio"
                name="applicant-type"
                checked={caseType === 'pr'}
                onChange={() => setCaseType('pr')}
              />
              PR
            </label>
          </div>
        </fieldset>

        <SelectField
          label="Assigned Consultant"
          id="assigned-consultant"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        >
          <option value="">Select…</option>
          {employees.data?.items.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.user.first_name} {emp.user.last_name}
            </option>
          ))}
        </SelectField>
        <p className="text-caption text-text-secondary">Branch auto-fills from the assigned consultant.</p>
      </form>
    </Modal>
  )
}

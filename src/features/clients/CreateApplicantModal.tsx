import { useState, type FormEvent } from 'react'
import { SelectField } from '@/components/SelectField'
import { useNavigate } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useEmployees } from '@/queries/staff'
import { useCreateApplicant } from '@/queries/clients'
import {
  EMAIL_ERROR,
  MINIMUM_AGE_ERROR,
  PHONE_ERROR,
  isAtLeastMinimumAge,
  isValidEmail,
  isValidPhone,
} from '@/lib/validation'
import { localDateISO } from '@/lib/time'
import { useAccountWords } from '@/lib/accountWords'

// Was its own page (`/clients/new`) — folded into Clients List as a popup (user-requested),
// same move already made for Import Leads/Add Lead on Lead Pool (see ImportLeadsModal.tsx).
// ClientsListPage decides whether to render the trigger button at all (tier gate), so this modal
// assumes it's already allowed to be open.
export function CreateApplicantModal({ onClose }: { onClose: () => void }) {
  // H2 (2026-09-13) — an institute is not a consultancy; the nouns follow `kind`.
  const words = useAccountWords()
  const navigate = useNavigate()
  const employees = useEmployees()
  const createApplicant = useCreateApplicant()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [caseType, setCaseType] = useState<'student' | 'pr'>('student')
  const [employeeId, setEmployeeId] = useState('')

  const phoneError = phone && !isValidPhone(phone) ? PHONE_ERROR : undefined
  const emailError = email && !isValidEmail(email) ? EMAIL_ERROR : undefined
  // Date of birth is required and carries the same 16-year floor as signup (assumptions audit
  // C9, approved 2026-09-19) — an applicant created here used to have none at all, and a missing
  // date of birth counted as an adult for the guardian gate and for age targeting. The message
  // mirrors the server's 422 `below_minimum_age` word for word, so the answer is the same
  // wherever the consultant meets it.
  const dobTooYoung = Boolean(dateOfBirth) && !isAtLeastMinimumAge(dateOfBirth)
  const dobError = dobTooYoung ? MINIMUM_AGE_ERROR : undefined
  const canSubmit =
    Boolean(firstName && lastName && email && employeeId && dateOfBirth) && !phoneError && !emailError && !dobError

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    createApplicant.mutate(
      {
        first_name: firstName,
        last_name: lastName,
        email,
        date_of_birth: dateOfBirth,
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
        <div className="flex flex-col gap-xs">
          <TextField
            label="Date of birth"
            type="date"
            required
            max={localDateISO()}
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            error={dobError}
          />
          <p className="pl-lg text-caption text-text-secondary">
            Needed before anything else can be recorded — age decides what an applicant can do on
            Sentpo, and a missing date of birth used to count as an adult.
          </p>
        </div>
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
          label={words.isInstitute ? 'Assigned team member' : 'Assigned Consultant'}
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
        <p className="text-caption text-text-secondary">Branch auto-fills from the assigned {words.person}.</p>
      </form>
    </Modal>
  )
}

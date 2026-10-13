import { useState, type FormEvent } from 'react'
import { StillNeeded } from '@/components/StillNeeded'
import { ServerSearchSelect } from '@/components/ServerSearchSelect'
import { useNavigate } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { activeEmployeeSource } from '@/queries/pickerSources'
import { useCreateApplicant } from '@/queries/clients'
import type { ApplicantRequest } from '@/queries/applicantRequests'
import { createApplicantErrorMessage, dailyLimitLine } from '@/lib/applicantRequestWords'
import { ALREADY_APPLIED_NOTICE, isAlreadyApplied, usePayloadIdempotencyKey } from '@/lib/useIdempotencyKey'
import { showToast } from '@/lib/toast'
import { EMAIL_ERROR, PHONE_ERROR, isValidEmail, isValidPhone } from '@/lib/validation'
import { useAccountWords } from '@/lib/accountWords'

// Was its own page (`/clients/new`) — folded into Clients List as a popup (user-requested),
// same move already made for Import Leads/Add Lead on Lead Pool (see ImportLeadsModal.tsx).
// ClientsListPage decides whether to render the trigger button at all (tier gate), so this modal
// assumes it's already allowed to be open.
export function CreateApplicantModal({ onClose }: { onClose: () => void }) {
  // H2 (2026-09-13) — an institute is not a consultancy; the nouns follow `kind`.
  const words = useAccountWords()
  const navigate = useNavigate()
  const createApplicant = useCreateApplicant()
  // One key per opened form and content: a retry of the same applicant replays the first answer
  // instead of creating a second account or sending a second request; edited details are new.
  const { keyFor, settle } = usePayloadIdempotencyKey()
  // Set when the server answered 202 (contract gate 12f): the email or phone belongs to an
  // existing Sentpo student, so nothing was created and there is no client page to open.
  const [sentRequest, setSentRequest] = useState<ApplicantRequest | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  // No default (assumptions audit M38, product owner 2026-09-19) — `student` used to be
  // pre-selected, so a PR case created by a consultant who never looked at this group was
  // commissioned at the student rate and opened an Applications tab it has no use for. The
  // person chooses; the form does not submit until they have.
  const [caseType, setCaseType] = useState<'student' | 'pr' | ''>('')
  const [employeeId, setEmployeeId] = useState('')
  // Required tick (owner ruling): the consultant confirms the person is 16 or older. No date of
  // birth is asked here; the applicant gives their own when they first sign in to the app.
  const [ageConfirmed, setAgeConfirmed] = useState(false)

  const phoneError = phone && !isValidPhone(phone) ? PHONE_ERROR : undefined
  const emailError = email && !isValidEmail(email) ? EMAIL_ERROR : undefined
  // No date of birth here (Phase 8, D-129 C-2): the student gives their own the first time they
  // sign in to the app.
  const canSubmit =
    Boolean(firstName && lastName && email && employeeId && caseType && ageConfirmed) && !phoneError && !emailError
  // T4-14: the button is off until these are filled in, so the footer names what is missing.
  const stillNeeded = [
    ...(firstName ? [] : ['first name']),
    ...(lastName ? [] : ['last name']),
    ...(email ? [] : ['email']),
    ...(caseType ? [] : ['applicant type']),
    ...(employeeId ? [] : [words.isInstitute ? 'assigned team member' : 'assigned consultant']),
    ...(ageConfirmed ? [] : ['confirmation that the applicant is 16 or older']),
    ...(phoneError ? ['a valid phone number'] : []),
    ...(emailError ? ['a valid email'] : []),
  ]

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const payload = {
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || null,
      address: address || null,
      case_type: caseType as 'student' | 'pr',
      assigned_employee_id: employeeId,
      age_confirmed: true as const,
    }
    createApplicant.mutate(
      { ...payload, idempotencyKey: keyFor(payload) },
      {
        onSuccess: (result) => {
          if (result.kind === 'created') navigate(`/clients/${result.client.id}`)
          else setSentRequest(result.request)
        },
        onError: (err) => {
          settle(err)
          // Already recorded (the first answer was lost): the write is done. Close, say so, never resubmit.
          if (isAlreadyApplied(err)) {
            showToast(ALREADY_APPLIED_NOTICE)
            onClose()
          }
        },
      },
    )
  }

  if (sentRequest) {
    const limitLine = dailyLimitLine(sentRequest.daily_limit)
    return (
      <Modal onClose={onClose} title="Request sent" widthRem={30} footer={<Button onClick={onClose}>Done</Button>} dismissible>
        <div className="flex flex-col gap-sm" role="status">
          <p className="text-body text-text-secondary">
            This person already has a Sentpo account. We've sent them a request to become your applicant. Nothing is
            shared with you until they accept in the app. You'll see it under Waiting for the student to accept.
          </p>
          {limitLine && <p className="text-body-sm text-text-secondary">{limitLine}</p>}
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Create Applicant"
      widthRem={36}
      footer={
        <>
          {createApplicant.isError && !isAlreadyApplied(createApplicant.error) && (
            <p className="mr-auto self-center text-body-sm text-error" role="alert">
              {createApplicantErrorMessage(createApplicant.error)}
            </p>
          )}
          <StillNeeded items={stillNeeded} />
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
          <p className="text-caption text-text-secondary">
            Pick one — it sets the commission rate and what the case shows. Nothing is assumed.
          </p>
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

        {/* Searched on the server (review F-036, lane x): every colleague who works here now can be
            chosen, however large the roster. */}
        <ServerSearchSelect
          label={words.isInstitute ? 'Assigned team member' : 'Assigned Consultant'}
          required
          id="assigned-consultant"
          source={activeEmployeeSource}
          value={employeeId}
          onChange={(id) => setEmployeeId(id)}
          placeholder="Search by name…"
          emptyText="No one matches that name."
        />
        <p className="text-caption text-text-secondary">Branch auto-fills from the assigned {words.person}.</p>

        <div className="flex flex-col gap-xs">
          <label className="flex items-center gap-xs text-body-sm text-text-primary">
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
              aria-describedby="age-confirmed-help"
              className="h-4 w-4"
            />
            I confirm this applicant is 16 or older.
          </label>
          <p id="age-confirmed-help" className="text-caption text-text-secondary">
            Sentpo is for students aged 16 and over. The applicant gives their date of birth when they first sign in to
            the Sentpo app.
          </p>
        </div>
      </form>
    </Modal>
  )
}

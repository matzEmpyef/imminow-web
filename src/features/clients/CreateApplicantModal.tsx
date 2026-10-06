import { useState, type FormEvent } from 'react'
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
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  // No default (assumptions audit M38, product owner 2026-09-19) — `student` used to be
  // pre-selected, so a PR case created by a consultant who never looked at this group was
  // commissioned at the student rate and opened an Applications tab it has no use for. The
  // person chooses; the form does not submit until they have.
  const [caseType, setCaseType] = useState<'student' | 'pr' | ''>('')
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
    Boolean(firstName && lastName && email && employeeId && dateOfBirth && caseType) &&
    !phoneError &&
    !emailError &&
    !dobError

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const payload = {
      first_name: firstName,
      last_name: lastName,
      email,
      date_of_birth: dateOfBirth,
      phone: phone || null,
      address: address || null,
      case_type: caseType as 'student' | 'pr',
      assigned_employee_id: employeeId,
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
      </form>
    </Modal>
  )
}

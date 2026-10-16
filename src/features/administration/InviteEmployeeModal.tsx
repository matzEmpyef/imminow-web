import { useState, type FormEvent } from 'react'
import { SelectField } from '@/components/SelectField'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useInviteEmployee } from '@/queries/staff'
import { BranchAccessPicker } from './BranchAccessPicker'
import { primaryBranchError, type BranchAccess } from './branchAccess'
import {
  cleanName,
  emailError as checkEmail,
  isTextOk,
  normaliseEmail,
  phoneError as checkPhone,
  phoneToSend,
} from '@/lib/validation'
import { usePhoneRegion } from '@/lib/phoneRegion'
import { useServerFieldErrors } from '@/lib/useServerFieldErrors'
import { showToast } from '@/lib/toast'
import { inviteEmployeeErrorMessage } from '@/lib/inviteEmployeeWords'
import type { components } from '@/api/schema'

type Designation = components['schemas']['Designation']
type Branch = components['schemas']['Branch']

// User-requested — was an inline Card+form toggled below the page header, same move already
// made for Create Applicant/Add Lead elsewhere this session.
export function InviteEmployeeModal({
  hasDesignations,
  designations,
  branches,
  hasMultiBranch,
  onClose,
}: {
  hasDesignations: boolean
  designations: Designation[]
  branches: Branch[]
  hasMultiBranch: boolean
  onClose: () => void
}) {
  const inviteEmployee = useInviteEmployee()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  // ONE Designation field (console review M6, 2026-09-13). It used to be two: a free-text job
  // title ("e.g. Senior Consultant") plus a separate "Access Rights" select over the very same
  // designations list, so an admin had to type a name and then pick the matching one — and the
  // two drifted apart the moment either was edited. The select is the field now; its NAME is
  // still sent as the title, so the Employees table's Designation column keeps reading the same
  // way and the server's payload shape is unchanged.
  const [designationId, setDesignationId] = useState('')
  // Branch coverage and the primary branch are asked for AT INVITE TIME since 2026-09-21 (product
  // owner) — the primary decides which branch this person's leads and clients are filed under, and
  // it used to be inferred from whatever order `branch_ids` happened to be in. It starts empty:
  // with nothing ticked the whole group is omitted from the request, so the server's own default
  // stands and a single-branch consultancy sees exactly what it saw before.
  const [access, setAccess] = useState<BranchAccess>({ branchIds: [], primaryId: '' })
  const showBranches = hasMultiBranch && branches.length > 1

  const selectedDesignation = designations.find((d) => d.id === designationId)

  const region = usePhoneRegion()
  const emailError = checkEmail(email)
  const phoneError = checkPhone(phone, region)
  const server = useServerFieldErrors(inviteEmployee.error, { first_name: firstName, last_name: lastName, email, phone })
  const primaryError = showBranches ? primaryBranchError(access) : undefined
  const canInvite =
    isTextOk('name', firstName) &&
    isTextOk('name', lastName) &&
    Boolean(email.trim()) &&
    !emailError &&
    !phoneError &&
    !primaryError

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canInvite) return
    inviteEmployee.mutate(
      {
        first_name: cleanName(firstName),
        last_name: cleanName(lastName),
        email: normaliseEmail(email),
        phone: phone.trim() ? phoneToSend(phone, region) : undefined,
        // Without the Designations feature (Starter's preset) neither is asked for nor sent: the
        // server puts the invitee on the protected Full access designation (owner, 2026-09-25).
        ...(hasDesignations
          ? { designation: selectedDesignation?.name || undefined, designation_id: designationId || undefined }
          : {}),
        ...(showBranches && access.branchIds.length > 0
          ? { branch_ids: access.branchIds, primary_branch_id: access.primaryId || undefined }
          : {}),
      },
      {
        onSuccess: () => {
          showToast(`Invite sent to ${normaliseEmail(email)}`)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Invite Employee"
      widthRem={28}
      footer={
        <>
          {inviteEmployee.isError && !server.allBesideFields && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {inviteEmployeeErrorMessage(inviteEmployee.error)}
            </p>
          )}
          <Button type="submit" form="invite-employee-form" loading={inviteEmployee.isPending} disabled={!canInvite}>
            Send Invite
          </Button>
        </>
      }
    >
      <form id="invite-employee-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
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
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError ?? server.messageFor('email')}
        />
        <TextField
          label="Phone"
          type="tel"
          phoneRegion={region}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={phoneError ?? server.messageFor('phone')}
        />
        {hasDesignations ? (
          <>
            <SelectField
              label="Designation"
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
            <p className="text-caption text-text-secondary">
              The designation also sets this employee&rsquo;s access rights. Adjust individual permissions afterwards
              from Manage Access.
            </p>
          </>
        ) : (
          // Starter = full access (product owner, 2026-09-25; build reference 1.15): nothing to pick,
          // so the form says what they will get instead of asking.
          <p className="rounded-md bg-background px-md py-sm text-caption text-text-secondary">
            They&rsquo;ll get <span className="font-medium text-text-primary">Full access</span> — all lead, client and
            plan work. Managing staff and branches, editing the profile, recording payments and exporting statements
            stay with the admin.
          </p>
        )}
        {showBranches && (
          <>
            <BranchAccessPicker
              branches={branches}
              value={access}
              onChange={setAccess}
              personLabel={`${firstName} ${lastName}`.trim() || 'this employee'}
            />
            {primaryError && <p className="text-caption text-error">{primaryError}</p>}
          </>
        )}
      </form>
    </Modal>
  )
}

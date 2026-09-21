import { useState, type FormEvent } from 'react'
import { SelectField } from '@/components/SelectField'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useInviteEmployee } from '@/queries/staff'
import { BranchAccessPicker } from './BranchAccessPicker'
import { primaryBranchError, type BranchAccess } from './branchAccess'
import { EMAIL_ERROR, PHONE_ERROR, isValidEmail, isValidPhone } from '@/lib/validation'
import { showToast } from '@/lib/toast'
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

  const emailError = email && !isValidEmail(email) ? EMAIL_ERROR : undefined
  const phoneError = phone && !isValidPhone(phone) ? PHONE_ERROR : undefined
  const primaryError = showBranches ? primaryBranchError(access) : undefined
  const canInvite = Boolean(firstName && lastName && email) && !emailError && !phoneError && !primaryError

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canInvite) return
    inviteEmployee.mutate(
      {
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || undefined,
        designation: selectedDesignation?.name || undefined,
        designation_id: hasDesignations ? designationId || undefined : undefined,
        ...(showBranches && access.branchIds.length > 0
          ? { branch_ids: access.branchIds, primary_branch_id: access.primaryId || undefined }
          : {}),
      },
      {
        onSuccess: () => {
          showToast(`Invite sent to ${email}`)
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
        {hasDesignations && (
          <p className="text-caption text-text-secondary">
            The designation also sets this employee&rsquo;s access rights. Adjust individual permissions afterwards from
            Manage Access.
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

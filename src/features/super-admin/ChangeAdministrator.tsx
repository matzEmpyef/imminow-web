import { useState } from 'react'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { SelectField } from '@/components/SelectField'
import { StillNeeded } from '@/components/StillNeeded'
import { TextAreaField } from '@/components/TextAreaField'
import { TextField } from '@/components/TextField'
import { ApiError } from '@/api/errors'
import { usePlatformPermission } from '@/lib/me'
import { aboutHowLong, retryAfterSeconds } from '@/lib/retryAfter'
import { showToast } from '@/lib/toast'
import { useConsultancyStaff, useHandOverAdmin } from '@/queries/adminConsultancies'

/** The Support Tools permission: the server checks the same key on the hand-over route. */
const SUPPORT_TOOLS = 'support_tools'

type StaffMember = NonNullable<ReturnType<typeof useConsultancyStaff>['data']>[number]

/** What a person is called in the picker: their name and address, or the address alone when there is no name. */
function staffLabel(member: StaffMember): string {
  const name = member.name.trim()
  const email = (member.email ?? '').trim()
  if (name && email) return `${name} (${email})`
  return name || email || 'Unnamed member of staff'
}

/** Who can be chosen: active staff who have accepted their invitation, not the current admin. */
function eligibleStaff(staff: StaffMember[]): StaffMember[] {
  return staff.filter((member) => member.status === 'active' && !member.is_consultancy_admin)
}

/**
 * The "Change administrator" row on a consultancy in Manage Consultancies. Shown to a person
 * holding the Support Tools permission only; nobody else is offered it.
 */
export function ChangeAdministratorSection({
  consultancyId,
  consultancyName,
}: {
  consultancyId: string
  consultancyName: string
}) {
  const allowed = usePlatformPermission(SUPPORT_TOOLS)
  const [open, setOpen] = useState(false)
  if (!allowed) return null
  return (
    <div className="flex items-center justify-between gap-md p-md">
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-text-primary">Administrator</p>
        <p className="text-caption text-text-secondary">
          Make another member of staff the administrator of this account, for example when the owner has left.
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Change administrator
      </Button>
      {open && (
        <ChangeAdministratorModal
          consultancyId={consultancyId}
          consultancyName={consultancyName}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

/**
 * Support gives a consultancy's administrator role to another member of its staff. A reason and
 * the operator's own password are needed, like the other Support actions that change who holds an
 * account. Every refusal is the server's own sentence, shown beside the form.
 */
export function ChangeAdministratorModal({
  consultancyId,
  consultancyName,
  onClose,
}: {
  consultancyId: string
  consultancyName: string
  onClose: () => void
}) {
  const handOver = useHandOverAdmin(consultancyId)
  const staffQuery = useConsultancyStaff(consultancyId)
  const staff = staffQuery.data ?? null
  const [employeeId, setEmployeeId] = useState('')
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')

  const candidates = staff ? eligibleStaff(staff) : []
  const chosen = candidates.find((member) => member.id === employeeId)

  const error = handOver.error
  const code = error instanceof ApiError ? error.code : undefined
  const passwordRefused = code === 'invalid_current_password' || code === 'step_up_required'
  const waitSeconds = retryAfterSeconds(error)
  const retry = waitSeconds ? aboutHowLong(waitSeconds) : null

  const stillNeeded = [
    ...(employeeId ? [] : ['the new administrator']),
    ...(reason.trim().length >= 3 ? [] : ['a reason (at least 3 characters)']),
    ...(password ? [] : ['your password']),
  ]

  function submit() {
    if (stillNeeded.length > 0 || handOver.isPending) return
    handOver.mutate(
      { employee_id: employeeId, reason: reason.trim(), password },
      {
        onSuccess: (done) => {
          showToast(`${chosen ? staffName(chosen) : 'The new administrator'} is now the administrator of ${done.consultancy_name || consultancyName}.`)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Change administrator"
      widthRem={32}
      footer={
        <>
          {handOver.isError && !passwordRefused && (
            <div role="alert" className="mr-auto flex flex-col gap-0.5 self-center">
              <p className="text-body-sm text-error">{handOver.error.message}</p>
              {retry && <p className="text-caption text-text-secondary">You can try again in {retry}.</p>}
            </div>
          )}
          <StillNeeded items={stillNeeded} />
          <Button variant="secondary" onClick={onClose} disabled={handOver.isPending}>
            Cancel
          </Button>
          <Button loading={handOver.isPending} disabled={stillNeeded.length > 0} onClick={submit}>
            Change administrator
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          Choose who becomes the administrator of <span className="font-medium text-text-primary">{consultancyName}</span>.
        </p>
        <p className="text-caption text-text-secondary">
          The current administrator stays on the staff with full access to its work. Both people are told.
        </p>

        {staffQuery.isPending ? (
          <p role="status" className="text-body-sm text-text-secondary">
            Loading the staff&hellip;
          </p>
        ) : staff && candidates.length === 0 ? (
          <p role="status" className="text-body-sm text-text-secondary">
            There is no one to choose yet. The new administrator must be an active member of staff who has accepted
            their invitation.
          </p>
        ) : staff ? (
          <SelectField
            label="New administrator"
            required
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Choose a member of staff</option>
            {candidates.map((member) => (
              <option key={member.id} value={member.id}>
                {staffLabel(member)}
              </option>
            ))}
          </SelectField>
        ) : (
          <p role="status" className="text-body-sm text-text-secondary">
            {staffQuery.error?.message ?? 'This consultancy’s staff list could not be shown.'} No one can be chosen.
            Reload the page and try again.
          </p>
        )}

        <TextAreaField
          label="Reason"
          required
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="Why the administrator is being changed. Kept on the record."
        />
        <TextField
          label="Your password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordRefused ? error?.message : undefined}
        />
      </div>
    </Modal>
  )
}

/** The name alone, for the confirmation toast. */
function staffName(member: StaffMember): string {
  return member.name.trim() || (member.email ?? '').trim() || 'The new administrator'
}

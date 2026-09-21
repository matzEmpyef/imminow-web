import { useState } from 'react'
import { SelectField } from '@/components/SelectField'
import { UserCog } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { Toggle } from '@/components/Toggle'
import { useDisableEmployee, useEmployees, useUpdateEmployee } from '@/queries/staff'
import { BranchAccessPicker } from './BranchAccessPicker'
import { branchAccessChanged, primaryBranchError, type BranchAccess } from './branchAccess'
import { permissionGroupsFor } from '@/lib/permissions'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'

type Employee = components['schemas']['Employee']
type Designation = components['schemas']['Designation']
type Branch = components['schemas']['Branch']
// User-requested — "Manage Access" was a labeled Button that expanded the row inline via
// Table's `expandable` prop; now an icon trigger opening a popup instead, same move
// DesignationPermissionsModal.tsx just made for "View Permissions."
export function EmployeeAccessModal({
  employee,
  designations,
  branches,
  hasMultiBranch,
  hasDesignations,
}: {
  employee: Employee
  designations: Designation[]
  branches: Branch[]
  hasMultiBranch: boolean
  hasDesignations: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="contents">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Manage access for ${employee.user!.first_name} ${employee.user!.last_name}`}
        title="Manage access"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <UserCog className="h-4 w-4" />
      </button>
      {open && (
        <AccessModalBody
          employee={employee}
          designations={designations}
          branches={branches}
          hasMultiBranch={hasMultiBranch}
          hasDesignations={hasDesignations}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function AccessModalBody({
  employee,
  designations,
  branches,
  hasMultiBranch,
  hasDesignations,
  onClose,
}: {
  employee: Employee
  designations: Designation[]
  branches: Branch[]
  hasMultiBranch: boolean
  hasDesignations: boolean
  onClose: () => void
}) {
  const updateEmployee = useUpdateEmployee(employee.id!)
  const disableEmployee = useDisableEmployee()
  const [designationId, setDesignationId] = useState(employee.designation_id ?? '')
  // The stored primary, or the fallback the server itself applies when none was ever chosen —
  // `branch_ids[0]`. Starting from the fallback rather than from blank is what keeps a
  // single-branch consultancy seeing no change: the radio is already on the only branch there is.
  const storedAccess: BranchAccess = {
    branchIds: employee.branch_ids ?? [],
    primaryId: employee.primary_branch_id ?? employee.branch_ids?.[0] ?? '',
  }
  const [access, setAccess] = useState<BranchAccess>(storedAccess)
  const [overrides, setOverrides] = useState<Record<string, boolean>>(employee.permission_overrides ?? {})
  const [reason, setReason] = useState('')
  const [confirmingDisable, setConfirmingDisable] = useState(false)
  // Who inherits this employee's leads and clients. Only asked for when they actually hold some
  // — the server's own rule, mirrored here so the dialog isn't padded with an irrelevant field.
  const [successorId, setSuccessorId] = useState('')
  const allEmployees = useEmployees()
  const assignedWork = employee.assigned_work_count ?? 0
  // Read from the same cached list the page above already fetched, not a second request.
  const successorOptions = (allEmployees.data?.items ?? []).filter((e) => e.id !== employee.id && e.active !== false)

  const designation = designations.find((d) => d.id === designationId)
  const baseline = designation?.permissions ?? {}
  // `dirty` means SENSITIVE change — it is what makes the reason mandatory (build reference 1.24),
  // so branch coverage and the primary branch are deliberately not part of it.
  const dirty =
    designationId !== employee.designation_id ||
    JSON.stringify(overrides) !== JSON.stringify(employee.permission_overrides ?? {})
  // …but they ARE changes, and Save was gated on `dirty` alone, which meant a branch-only edit
  // left the button disabled and could not be saved at all. Found while making the primary branch
  // a control (2026-09-21): a control nobody can submit is not a control.
  const branchesChanged = branchAccessChanged(access, storedAccess)
  const primaryError = primaryBranchError(access)
  const canSave = (dirty || branchesChanged) && (!dirty || Boolean(reason)) && !primaryError

  function togglePermission(key: string) {
    const effective = key in overrides ? overrides[key] : (baseline[key] ?? false)
    setOverrides((prev) => ({ ...prev, [key]: !effective }))
  }

  function handleSave() {
    updateEmployee.mutate(
      {
        branch_ids: access.branchIds,
        // Omitted rather than sent empty when they cover no branch: the server leaves the stored
        // value alone on an omission, and '' is not a branch id.
        primary_branch_id: access.primaryId || undefined,
        // ONLY WHEN THEY ACTUALLY CHANGED. The server treats the mere PRESENCE of either field as
        // a permission change and refuses the call 400 without a `reason` — so re-sending the
        // stored values unchanged, which this used to do, made every branch-only save demand an
        // audit reason for a permission nobody touched (caught live, 2026-09-21). It also covers
        // the account that has no `designations` entitlement: nothing about designations is on
        // screen there, so nothing about them is sent.
        ...(hasDesignations && dirty ? { designation_id: designationId, permission_overrides: overrides } : {}),
        reason: dirty ? reason : undefined,
      },
      {
        onSuccess: () => {
          showToast(`Access updated for ${employee.user!.first_name} ${employee.user!.last_name}`)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={`${employee.user!.first_name} ${employee.user!.last_name} — Access`}
      widthRem={30}
      footer={
        <>
          {updateEmployee.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updateEmployee.error.message}</p>
          )}
          <div className="flex gap-sm">
            <Button loading={updateEmployee.isPending} disabled={!canSave} onClick={handleSave}>
              Save Changes
            </Button>
            {!employee.is_consultancy_admin && employee.active && (
              <Button variant="destructive" onClick={() => setConfirmingDisable(true)}>
                Disable
              </Button>
            )}
          </div>
          {disableEmployee.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{disableEmployee.error.message}</p>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-md">
        {hasDesignations && (
          <SelectField
            label="Access Rights"
            id={`designation-${employee.id}`}
            value={designationId}
            onChange={(e) => setDesignationId(e.target.value)}
          >
            {designations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectField>
        )}

        {hasMultiBranch && branches.length > 1 && (
          <div className="flex flex-col gap-xs">
            {employee.is_consultancy_admin ? (
              <>
                <p className="text-body-sm font-medium text-text-primary">Branches</p>
                <p className="text-body-sm text-text-secondary">
                  Consultancy admins have access to every branch automatically — this list doesn't apply to them.
                </p>
              </>
            ) : (
              <>
                <BranchAccessPicker
                  branches={branches}
                  value={access}
                  onChange={setAccess}
                  personLabel={`${employee.user!.first_name} ${employee.user!.last_name}`}
                />
                {primaryError && <p className="text-caption text-error">{primaryError}</p>}
              </>
            )}
          </div>
        )}

        {hasDesignations && (
        <div className="flex flex-col gap-sm">
          <p className="text-body-sm font-medium text-text-primary">Individual permission overrides</p>
          {permissionGroupsFor(baseline, overrides).map((group) => (
            <div key={group.key}>
              <p className="text-caption font-medium text-text-secondary">{group.label}</p>
              <div className="mt-xs flex flex-col gap-xs">
                {group.permissions.map((perm) => {
                  const isOverride = perm.key in overrides
                  const effective = isOverride ? overrides[perm.key] : (baseline[perm.key] ?? false)
                  return (
                    <div key={perm.key} className="flex items-center justify-between">
                      <span className="text-body-sm text-text-primary">
                        {perm.label}
                        {isOverride && <span className="ml-xs text-caption text-primary">(override)</span>}
                      </span>
                      <Toggle checked={effective} onChange={() => togglePermission(perm.key)} label={perm.label} />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        )}

        {dirty && (
          <TextField
            label="Reason for this permission change (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </div>

      {/* User-requested (2026-08-15) — "wherever there is delete, confirm popup is needed." */}
      {confirmingDisable && (
        <Modal
          onClose={() => setConfirmingDisable(false)}
          title="Disable Employee"
          widthRem={24}
          footer={
            <div className="flex justify-end gap-sm">
              <Button variant="secondary" onClick={() => setConfirmingDisable(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={disableEmployee.isPending}
                disabled={assignedWork > 0 && !successorId}
                onClick={() =>
                  disableEmployee.mutate(
                    { id: employee.id!, reassign_to_employee_id: successorId || undefined },
                    { onSuccess: () => setConfirmingDisable(false) },
                  )
                }
              >
                Disable
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-md">
            <p className="text-body-sm text-text-secondary">
              Disable{' '}
              <span className="font-medium text-text-primary">
                {employee.user!.first_name} {employee.user!.last_name}
              </span>
              ? They'll lose access immediately — their session stops working and they can't sign back in.
            </p>
            {assignedWork > 0 && (
              <div className="flex flex-col gap-xs">
                <p className="text-body-sm font-medium text-text-primary">
                  Reassign their {assignedWork} lead{assignedWork === 1 ? '' : 's'}/client
                  {assignedWork === 1 ? '' : 's'} to
                </p>
                <SelectField label="Reassign to" value={successorId} onChange={(e) => setSuccessorId(e.target.value)}>
                  <option value="">Select an employee…</option>
                  {successorOptions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.user!.first_name} {e.user!.last_name}
                    </option>
                  ))}
                </SelectField>
                <p className="text-caption text-text-secondary">
                  Work left on a disabled account shows up on nobody's list, so this can't be skipped.
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </Modal>
  )
}

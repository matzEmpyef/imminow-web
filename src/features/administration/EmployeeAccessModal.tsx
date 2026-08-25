import { useState } from 'react'
import { SelectField } from '@/components/SelectField'
import { UserCog } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { Toggle } from '@/components/Toggle'
import { useDisableEmployee, useEmployees, useUpdateEmployee } from '@/queries/staff'
import { PERMISSION_GROUPS } from '@/lib/permissions'
import type { components } from '@/api/schema'

type Employee = components['schemas']['Employee']
type Designation = components['schemas']['Designation']
type Branch = components['schemas']['Branch']
type Tier = 'starter' | 'business' | 'ultimate'

// User-requested — "Manage Access" was a labeled Button that expanded the row inline via
// Table's `expandable` prop; now an icon trigger opening a popup instead, same move
// DesignationPermissionsModal.tsx just made for "View Permissions."
export function EmployeeAccessModal({
  employee,
  designations,
  branches,
  tier,
}: {
  employee: Employee
  designations: Designation[]
  branches: Branch[]
  tier: Tier
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
          tier={tier}
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
  tier,
  onClose,
}: {
  employee: Employee
  designations: Designation[]
  branches: Branch[]
  tier: Tier
  onClose: () => void
}) {
  const updateEmployee = useUpdateEmployee(employee.id!)
  const disableEmployee = useDisableEmployee()
  const [designationId, setDesignationId] = useState(employee.designation_id ?? '')
  const [branchIds, setBranchIds] = useState<Set<string>>(new Set(employee.branch_ids ?? []))
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
  const dirty =
    designationId !== employee.designation_id ||
    JSON.stringify(overrides) !== JSON.stringify(employee.permission_overrides ?? {})

  function togglePermission(key: string) {
    const effective = key in overrides ? overrides[key] : (baseline[key] ?? false)
    setOverrides((prev) => ({ ...prev, [key]: !effective }))
  }

  function toggleBranch(id: string) {
    setBranchIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSave() {
    updateEmployee.mutate(
      {
        branch_ids: [...branchIds],
        designation_id: designationId,
        permission_overrides: overrides,
        reason: dirty ? reason : undefined,
      },
      { onSuccess: onClose },
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
            <Button loading={updateEmployee.isPending} disabled={!dirty || (dirty && !reason)} onClick={handleSave}>
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

        {tier === 'ultimate' && branches.length > 1 && (
          <div className="flex flex-col gap-xs">
            <p className="text-body-sm font-medium text-text-primary">Branches</p>
            {employee.is_consultancy_admin ? (
              <p className="text-body-sm text-text-secondary">
                Consultancy admins have access to every branch automatically — this list doesn't apply to them.
              </p>
            ) : (
              <div className="flex flex-wrap gap-md">
                {branches.map((b) => (
                  <label key={b.id} className="flex items-center gap-xs text-body-sm">
                    <input
                      type="checkbox"
                      checked={branchIds.has(b.id!)}
                      onChange={() => toggleBranch(b.id!)}
                      className="h-4 w-4"
                    />
                    {b.name}
                    {employee.primary_branch_id === b.id && (
                      <span className="text-caption text-text-secondary">(primary)</span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-sm">
          <p className="text-body-sm font-medium text-text-primary">Individual permission overrides</p>
          {PERMISSION_GROUPS.map((group) => (
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
                <label className="text-body-sm font-medium text-text-primary" htmlFor={`successor-${employee.id}`}>
                  Reassign their {assignedWork} lead{assignedWork === 1 ? '' : 's'}/client
                  {assignedWork === 1 ? '' : 's'} to
                </label>
                <select
                  id={`successor-${employee.id}`}
                  value={successorId}
                  onChange={(e) => setSuccessorId(e.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-surface px-3 text-body"
                >
                  <option value="">Select an employee…</option>
                  {successorOptions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.user!.first_name} {e.user!.last_name}
                    </option>
                  ))}
                </select>
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

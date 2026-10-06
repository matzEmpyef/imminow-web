import { useState } from 'react'
import { Eye } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { Toggle } from '@/components/Toggle'
import { useUpdateDesignation } from '@/queries/staff'
import {
  OWN_DESIGNATION_REASON,
  isOwnDesignation,
  permissionKeys,
  protectedDesignationReason,
  useAvailablePermissions,
  visiblePermissionGroups,
} from '@/lib/permissions'
import { useMeStaff } from '@/lib/me'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'

type Designation = components['schemas']['Designation']

// User-requested — "View Permissions" was a labeled button that expanded the row inline; now an
// icon trigger opening a popup instead. The body only mounts while the modal is open, so its
// draft state (`permissions`/`reason`) resets fresh each time, same as the inline version
// unmounting when collapsed.
export function DesignationPermissionsModal({ designation }: { designation: Designation }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="contents">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View permissions for ${designation.name}`}
        title="View permissions"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Eye className="h-4 w-4" />
      </button>
      {open && <PermissionsModalBody designation={designation} onClose={() => setOpen(false)} />}
    </div>
  )
}

function PermissionsModalBody({ designation, onClose }: { designation: Designation; onClose: () => void }) {
  const updateDesignation = useUpdateDesignation(designation.id!)
  // Read-only for a built-in designation, and for the one the caller is on themselves (review
  // F-146): the server refuses both, so the switches say so up front instead of failing on Save.
  const ownDesignation = isOwnDesignation(useMeStaff(), designation.id)
  const readOnly = Boolean(designation.protected) || ownDesignation
  const stored = designation.permissions ?? {}
  // Only what the plan gives meaning to, in the server's order (2026-09-25). Includes any key the
  // server already holds that this build's registry lacks (M34) when the record predates the field.
  const groups = visiblePermissionGroups(useAvailablePermissions(), stored)
  const visibleKeys = permissionKeys(groups)
  // The FULL visible map — every shown key, ticked or not. A hidden key is never sent, and the
  // server keeps its stored tick, so it still applies once the plan includes its feature.
  const visibleMap = (map: Record<string, boolean>) =>
    Object.fromEntries(visibleKeys.map((key) => [key, Boolean(map[key])]))
  const [permissions, setPermissions] = useState<Record<string, boolean>>(stored)
  const [reason, setReason] = useState('')
  const dirty = !readOnly && JSON.stringify(visibleMap(permissions)) !== JSON.stringify(visibleMap(stored))

  function toggle(key: string) {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleSave() {
    updateDesignation.mutate(
      { name: designation.name, permissions: visibleMap(permissions), reason },
      {
        onSuccess: () => {
          showToast(`Permissions updated for ${designation.name}`)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={`${designation.name} — Permissions`}
      widthRem={30}
      footer={
        // Read-only has nothing to commit; the dialog's own close button is the way out.
        readOnly ? undefined : (
          <>
            {updateDesignation.isError && (
              <p className="mr-auto self-center text-body-sm text-error">{updateDesignation.error.message}</p>
            )}
            <Button loading={updateDesignation.isPending} disabled={!dirty || !reason} onClick={handleSave}>
              Save Changes
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-sm">
        {/* A protected designation (Owner/Admin, Full access — build reference 1.15) is shown, not
            edited: the server refuses any change 409, so the switches say so up front. */}
        {readOnly && (
          <p className="rounded-md bg-background px-md py-sm text-body-sm text-text-secondary">
            {designation.protected ? protectedDesignationReason(designation.name) : OWN_DESIGNATION_REASON}
          </p>
        )}
        {groups.map((group) => (
          <div key={group.key}>
            <p className="text-caption font-medium text-text-secondary">{group.label}</p>
            <div className="mt-xs flex flex-col gap-xs">
              {group.permissions.map((perm) => (
                <div key={perm.key} className="flex items-center justify-between">
                  <span className="text-body-sm text-text-primary">{perm.label}</span>
                  <Toggle
                    checked={Boolean(permissions[perm.key])}
                    onChange={() => toggle(perm.key)}
                    label={perm.label}
                    disabled={readOnly}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {dirty && (
          <TextField
            label="Reason for this change (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </div>
    </Modal>
  )
}


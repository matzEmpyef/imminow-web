import { useState } from 'react'
import { Eye } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { Toggle } from '@/components/Toggle'
import { useUpdateDesignation } from '@/queries/staff'
import { PERMISSION_GROUPS } from '@/lib/permissions'
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
  const [permissions, setPermissions] = useState<Record<string, boolean>>(designation.permissions ?? {})
  const [reason, setReason] = useState('')
  const dirty = JSON.stringify(permissions) !== JSON.stringify(designation.permissions ?? {})

  function toggle(key: string) {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleSave() {
    updateDesignation.mutate({ name: designation.name, permissions, reason }, { onSuccess: onClose })
  }

  return (
    <Modal
      onClose={onClose}
      title={`${designation.name} — Permissions`}
      widthRem={30}
      footer={
        <>
          {updateDesignation.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updateDesignation.error.message}</p>
          )}
          <Button loading={updateDesignation.isPending} disabled={!dirty || !reason} onClick={handleSave}>
            Save Changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-sm">
        {PERMISSION_GROUPS.map((group) => (
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

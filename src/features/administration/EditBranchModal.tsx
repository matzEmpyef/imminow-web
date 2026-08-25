import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useUpdateBranch } from '@/queries/staff'
import type { components } from '@/api/schema'

type Branch = components['schemas']['Branch']

// User-requested — was an inline Card form rendered below the table when editingId was set,
// same move already made for Create Applicant/Add Lead/Invite Employee/Add Branch.
export function EditBranchModal({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const updateBranch = useUpdateBranch(branch.id!)
  const [name, setName] = useState(branch.name)
  const [address, setAddress] = useState(branch.address)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name || !address) return
    updateBranch.mutate({ name, address }, { onSuccess: onClose })
  }

  return (
    <Modal
      onClose={onClose}
      title="Edit Branch"
      widthRem={26}
      footer={
        <>
          {updateBranch.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updateBranch.error.message}</p>
          )}
          <Button type="submit" form="edit-branch-form" loading={updateBranch.isPending} disabled={!name || !address}>
            Save
          </Button>
        </>
      }
    >
      <form id="edit-branch-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </form>
    </Modal>
  )
}

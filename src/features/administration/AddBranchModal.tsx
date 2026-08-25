import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useCreateBranch } from '@/queries/staff'

// User-requested — was an inline Card+form toggled below the page header, same move already
// made for Create Applicant/Add Lead/Invite Employee elsewhere this session.
export function AddBranchModal({ onClose }: { onClose: () => void }) {
  const createBranch = useCreateBranch()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name || !address) return
    createBranch.mutate({ name, address }, { onSuccess: onClose })
  }

  return (
    <Modal
      onClose={onClose}
      title="Add Branch"
      widthRem={26}
      footer={
        <>
          {createBranch.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{createBranch.error.message}</p>
          )}
          <Button type="submit" form="add-branch-form" loading={createBranch.isPending} disabled={!name || !address}>
            Create
          </Button>
        </>
      }
    >
      <form id="add-branch-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </form>
    </Modal>
  )
}

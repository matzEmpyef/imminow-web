import { useState, type FormEvent } from 'react'
import { ServerSearchSelect } from '@/components/ServerSearchSelect'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useCreateDesignation } from '@/queries/staff'
import { activeEmployeeSource } from '@/queries/pickerSources'
import { showToast } from '@/lib/toast'

// User-requested — was an inline Card+form toggled below the page header, same move already
// made for Create Applicant/Add Lead/Invite Employee/Add Branch.
export function CreateDesignationModal({ onClose }: { onClose: () => void }) {
  const createDesignation = useCreateDesignation()
  const [name, setName] = useState('')
  const [duplicateFrom, setDuplicateFrom] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name) return
    createDesignation.mutate(
      { name, duplicate_from_employee_id: duplicateFrom || undefined },
      {
        onSuccess: () => {
          showToast(`${name} designation created`)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="New Designation"
      widthRem={28}
      footer={
        <>
          {createDesignation.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{createDesignation.error.message}</p>
          )}
          <Button type="submit" form="create-designation-form" loading={createDesignation.isPending} disabled={!name}>
            Create
          </Button>
        </>
      }
    >
      <form id="create-designation-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        {/* Optional. Searched on the server (review F-036, lane x), so any colleague can be the
            starting point, not only the first hundred on the roster. */}
        <div className="flex flex-col gap-xs">
          <ServerSearchSelect
            label="Copy access from"
            id="duplicate-from"
            source={activeEmployeeSource}
            value={duplicateFrom}
            onChange={(id) => setDuplicateFrom(id)}
            placeholder="Start from scratch, or search by name…"
            emptyText="No one matches that name."
          />
          <p className="text-caption text-text-secondary">
            Leave this empty to start from scratch. Choose a colleague to begin with the access they have now.
          </p>
        </div>
      </form>
    </Modal>
  )
}

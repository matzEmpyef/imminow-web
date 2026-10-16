import { useState, type FormEvent } from 'react'
import { ServerSearchSelect } from '@/components/ServerSearchSelect'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useCreateDesignation, useDesignations } from '@/queries/staff'
import { DESIGNATION_NAME_TAKEN, designationNameTaken } from '@/lib/designationName'
import { activeEmployeeSource } from '@/queries/pickerSources'
import { fieldMessages } from '@/api/errors'
import { showToast } from '@/lib/toast'

// User-requested — was an inline Card+form toggled below the page header, same move already
// made for Create Applicant/Add Lead/Invite Employee/Add Branch.
export function CreateDesignationModal({ onClose }: { onClose: () => void }) {
  const createDesignation = useCreateDesignation()
  const existing = useDesignations()
  const [name, setName] = useState('')
  const [duplicateFrom, setDuplicateFrom] = useState('')

  // Checked against the list already loaded for the page; shown as soon as the name is typed.
  const nameTaken = designationNameTaken(name, existing.data)
  // The server checks the name too (a colleague may have just made the same one) and names the
  // field. Its sentence stays beside the field until the name is changed; both checks stay.
  const [refusedName, setRefusedName] = useState<string | null>(null)
  const servedNameError = refusedName === name ? fieldMessages(createDesignation.error).name : undefined
  const nameError = nameTaken ? DESIGNATION_NAME_TAKEN : servedNameError

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || nameTaken || servedNameError) return
    setRefusedName(name)
    createDesignation.mutate(
      { name: name.trim(), duplicate_from_employee_id: duplicateFrom || undefined },
      {
        onSuccess: () => {
          showToast(`${name.trim()} designation created`)
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
          {createDesignation.isError && !fieldMessages(createDesignation.error).name && (
            <p className="mr-auto self-center text-body-sm text-error">{createDesignation.error.message}</p>
          )}
          <Button type="submit" form="create-designation-form" loading={createDesignation.isPending} disabled={!name.trim() || Boolean(nameError)}>
            Create
          </Button>
        </>
      }
    >
      <form id="create-designation-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField
          kind="label"
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameError}
        />
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

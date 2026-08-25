import { useState, type FormEvent } from 'react'
import { SelectField } from '@/components/SelectField'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useCreateDesignation, useEmployees } from '@/queries/staff'

// User-requested — was an inline Card+form toggled below the page header, same move already
// made for Create Applicant/Add Lead/Invite Employee/Add Branch.
export function CreateDesignationModal({ onClose }: { onClose: () => void }) {
  const employees = useEmployees()
  const createDesignation = useCreateDesignation()
  const [name, setName] = useState('')
  const [duplicateFrom, setDuplicateFrom] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name) return
    createDesignation.mutate({ name, duplicate_from_employee_id: duplicateFrom || undefined }, { onSuccess: onClose })
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
        <SelectField
          label="Duplicate as new Designation from"
          id="duplicate-from"
          value={duplicateFrom}
          onChange={(e) => setDuplicateFrom(e.target.value)}
        >
          <option value="">Start from scratch</option>
          {employees.data?.items.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.user!.first_name} {emp.user!.last_name}&apos;s current access
            </option>
          ))}
        </SelectField>
      </form>
    </Modal>
  )
}

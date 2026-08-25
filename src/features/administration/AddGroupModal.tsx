import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { newFieldId, type FormFieldInput } from '@/lib/formFields'

// User-requested — "I create a group, personal details, then I should be able add fields under
// it." A group is a section container, not a data field, so it gets its own lightweight
// creation popup rather than going through the Add Field type dropdown.
//
// Doubles as the Edit Group (rename) popup when `editingGroup` is supplied (user-requested —
// "shouldn't we want the ability to edit also"). A group only has a name, so editing it is just
// renaming — `onSave` is called instead of `onAdd` so the caller keeps the group's existing id
// and fields untouched.
export function AddGroupModal({
  editingGroup,
  onAdd,
  onSave,
  onClose,
}: {
  editingGroup?: { id: string; label: string }
  onAdd: (group: FormFieldInput) => void
  onSave?: (label: string) => void
  onClose: () => void
}) {
  const isEditing = Boolean(editingGroup)
  const [label, setLabel] = useState(editingGroup?.label ?? '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!label) return
    if (isEditing) {
      onSave?.(label)
    } else {
      onAdd({ id: newFieldId(), type: 'group', label, required: false, fields: [] })
    }
    onClose()
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Group' : 'Add Group'}
      widthRem={26}
      footer={
        <Button type="submit" form="add-group-form" disabled={!label}>
          {isEditing ? 'Save Changes' : 'Add Group'}
        </Button>
      }
    >
      <form id="add-group-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Group name" value={label} onChange={(e) => setLabel(e.target.value)} />
      </form>
    </Modal>
  )
}

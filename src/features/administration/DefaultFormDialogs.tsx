import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { useDuplicateFormTemplate, useRestoreDefaultFormTemplate } from '@/queries/formTemplates'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'

type FormTemplate = components['schemas']['FormTemplate']

/**
 * Asked every time the default form is opened for editing (owner decisions 30/31): editing is
 * allowed, a copy is the better way. "Make a copy" duplicates the default and opens the COPY in
 * the editor; "Edit anyway" carries on to the default itself.
 */
export function EditDefaultFormDialog({
  form,
  onClose,
  onEditAnyway,
}: {
  form: Pick<FormTemplate, 'id' | 'name'>
  onClose: () => void
  onEditAnyway: () => void
}) {
  const navigate = useNavigate()
  const duplicateForm = useDuplicateFormTemplate()

  return (
    <Modal
      onClose={onClose}
      title="Edit the default form?"
      widthRem={28}
      dismissible
      footer={
        <>
          {duplicateForm.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{duplicateForm.error.message}</p>
          )}
          <div className="flex gap-sm">
            <Button
              loading={duplicateForm.isPending}
              onClick={() =>
                duplicateForm.mutate(form.id, {
                  onSuccess: (copy) => {
                    showToast(`${form.name} form duplicated`)
                    navigate(`/administration/forms/${copy.id}`)
                  },
                })
              }
            >
              Make a copy
            </Button>
            <Button variant="secondary" disabled={duplicateForm.isPending} onClick={onEditAnyway}>
              Edit anyway
            </Button>
          </div>
        </>
      }
    >
      <p className="text-body-sm text-text-secondary">
        This is your default form. We suggest making a copy and editing the copy, so you always have the original to
        go back to.
      </p>
    </Modal>
  )
}

/**
 * Confirms, then restores the default form. `currentDefaultId` is the default as the screen knows
 * it: the server hands the same form back when it was already the standard one, and a new version
 * (a new id) when it restored it or made it afresh.
 */
export function RestoreDefaultFormDialog({
  currentDefaultId,
  onClose,
  onRestored,
}: {
  currentDefaultId: string | undefined
  onClose: () => void
  onRestored?: (form: FormTemplate) => void
}) {
  const restore = useRestoreDefaultFormTemplate()

  return (
    <Modal
      onClose={onClose}
      title="Restore default form"
      widthRem={28}
      footer={
        <>
          {restore.isError && <p className="mr-auto self-center text-body-sm text-error">{restore.error.message}</p>}
          <div className="flex gap-sm">
            <Button
              loading={restore.isPending}
              onClick={() =>
                restore.mutate(undefined, {
                  onSuccess: (form) => {
                    showToast(
                      form.id === currentDefaultId
                        ? 'The default form is already the standard one.'
                        : 'Default form restored.',
                      form.id === currentDefaultId ? 'info' : 'success',
                    )
                    onClose()
                    onRestored?.(form)
                  },
                })
              }
            >
              Restore default
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <p className="text-body-sm text-text-secondary">
        Restore the default form? Its fields go back to the standard application form. Forms students have already
        filled in are not changed.
      </p>
    </Modal>
  )
}

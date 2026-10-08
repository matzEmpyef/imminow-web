import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { formatDateTime } from '@/lib/time'
import { useUndoCatalogImport, type CatalogImport } from '@/queries/catalogImports'

/**
 * The confirm step before an import is undone. What an undo does is the server's own sentence
 * (`undo_effect.message`); whether it may be undone at all is the server's answer (`can_undo`
 * offered the button, and a refusal here shows the server's own sentence).
 */
export function UndoImportModal({
  item,
  onClose,
  onStarted,
}: {
  item: CatalogImport
  onClose: () => void
  /** The undo has started (202): the caller shows its progress. */
  onStarted: (started: CatalogImport) => void
}) {
  const undo = useUndoCatalogImport()
  return (
    <Modal
      onClose={onClose}
      title="Undo this import?"
      widthRem={32}
      footer={
        <>
          {undo.isError && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {undo.error.message}
            </p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            loading={undo.isPending}
            onClick={() => undo.mutate(item.id, { onSuccess: onStarted })}
          >
            Undo this import
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-primary">
          <span className="font-medium">{item.file_name}</span>
          {item.applied_at ? `, applied on ${formatDateTime(item.applied_at)}` : ''}
          {item.applied_by ? ` by ${item.applied_by.name}` : ''}.
        </p>
        {item.undo_effect && <p className="text-body-sm text-text-secondary">{item.undo_effect.message}</p>}
      </div>
    </Modal>
  )
}

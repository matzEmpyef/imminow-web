import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { formatDateTime } from '@/lib/time'
import { useUndoCatalogImport, type CatalogImport } from '@/queries/catalogImports'

/**
 * The confirm step before an import is undone. It says what an undo does in plain words; whether
 * it may be undone at all is the server's answer (`can_undo` offered the button, and a refusal
 * here shows the server's own sentence).
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
        <ul className="flex list-disc flex-col gap-xs pl-5 text-body-sm text-text-secondary">
          <li>Campuses and courses it added are removed if nobody has used them yet. The others are switched off.</li>
          <li>Records it changed go back to their earlier values.</li>
          <li>Anything edited by hand since the import is left as it is. You get a list of those.</li>
        </ul>
      </div>
    </Modal>
  )
}

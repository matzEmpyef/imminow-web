import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useDocumentLibrary, useShareLibraryDocument } from '@/queries/documentLibrary'
import { useUploads } from '@/queries/uploads'

// User-requested (2026-08-15) — "Send Document can be a document from Document Library also..
// we need ability to select from this tab too." Reuses the same POST /document-library/{id}/share
// mutation Document Library's own row-level Share menu already calls (built earlier this
// session) — this modal is just the reverse entry point: browse the library from inside a
// specific client's Documents tab instead of picking a client from the library.
export function ShareFromLibraryModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const documents = useDocumentLibrary({ search: search || undefined })
  const share = useShareLibraryDocument()
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set())

  // User-requested (2026-08-19) — "if already shared disable share button or when tries to
  // share mention already shared." This client's own uploads already carry
  // `source_library_document_id` for anything shared from the library, so a document already
  // shared in a *previous* session is detected the same way as one just shared in this one.
  const uploads = useUploads(clientId)
  const alreadySharedLibraryIds = useMemo(
    () => new Set(uploads.data?.map((u) => u.source_library_document_id).filter((id): id is string => Boolean(id))),
    [uploads.data],
  )

  return (
    <Modal onClose={onClose} title="Share from Document Library" widthRem={30}>
      <div className="flex flex-col gap-md">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search library documents…"
          className="h-10 rounded-md border border-border bg-surface px-3 text-body"
        />
        <div className="flex max-h-80 flex-col gap-xs overflow-y-auto">
          {documents.isLoading && <p className="text-body-sm text-text-secondary">Loading…</p>}
          {/* H10 fix (frontend review, 1 Sep 2026) — a failed fetch used to fall through to "No
              documents match", indistinguishable from a genuinely empty library. */}
          {documents.isError && (
            <div className="flex items-center justify-between gap-sm">
              <p className="text-body-sm text-error">Could not load the document library.</p>
              <Button variant="secondary" size="sm" onClick={() => documents.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {!documents.isError && documents.data?.items.length === 0 && (
            <p className="text-body-sm text-text-secondary">No documents match.</p>
          )}
          {!documents.isError &&
            documents.data?.items.map((doc) => {
              const isShared = sharedIds.has(doc.id) || alreadySharedLibraryIds.has(doc.id)
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-sm rounded-md border border-border p-sm"
                >
                  <span className="min-w-0 flex-1 truncate text-body-sm text-text-primary">{doc.filename}</span>
                  <Button
                    variant="secondary"
                    className="shrink-0"
                    disabled={isShared}
                    loading={share.isPending && share.variables?.id === doc.id}
                    onClick={() =>
                      share.mutate(
                        { id: doc.id, journeyId: clientId },
                        { onSuccess: () => setSharedIds((prev) => new Set(prev).add(doc.id)) },
                      )
                    }
                  >
                    {isShared ? 'Already shared' : 'Share'}
                  </Button>
                </div>
              )
            })}
        </div>
        {share.isError && <p className="text-body-sm text-error">{share.error.message}</p>}
      </div>
    </Modal>
  )
}

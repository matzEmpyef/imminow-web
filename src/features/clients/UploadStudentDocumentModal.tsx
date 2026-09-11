import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { useStudentDocuments, useUploadStudentDocument } from '@/queries/studentDocuments'
import { showToast } from '@/lib/toast'

/**
 * Uploading a document on the student's behalf — the consultant scanned their passport at the
 * desk (2026-09-09).
 *
 * It lands in the STUDENT's locker, not this case's files, because it is their passport: it
 * follows them to their next case and their next consultancy, and they can revoke this
 * consultancy's access to it. Anything that is the consultancy's OWN work — a drafted SOP, a
 * checklist — belongs in "Shared by us" instead, which stays with the case.
 */
export function UploadStudentDocumentModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  // The catalog rides along on the same read the tab already makes, so this opens without waiting.
  const documents = useStudentDocuments(clientId)
  const upload = useUploadStudentDocument(clientId)
  const [documentTypeId, setDocumentTypeId] = useState('')
  const [label, setLabel] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const types = useMemo(() => documents.data?.types ?? [], [documents.data])
  const selected = types.find((t) => t.id === documentTypeId)
  // Mirrors the server's own refusals rather than letting the consultant discover them on submit.
  const needsExpiry = Boolean(selected?.expires)
  const canSubmit = Boolean(file && documentTypeId && (!needsExpiry || expiresOn))

  return (
    <Modal
      onClose={onClose}
      title="Upload for the student"
      widthRem={30}
      footer={
        <>
          {upload.isError && <p className="mr-auto self-center text-body-sm text-error">{upload.error.message}</p>}
          <div className="flex gap-sm">
            <Button
              loading={upload.isPending}
              disabled={!canSubmit}
              onClick={() =>
                file &&
                canSubmit &&
                upload.mutate(
                  {
                    file,
                    documentTypeId,
                    ...(label ? { label } : {}),
                    ...(expiresOn ? { expiresOn } : {}),
                  },
                  {
                    onSuccess: () => {
                      showToast('Document uploaded')
                      onClose()
                    },
                  },
                )
              }
            >
              Upload
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          This goes into the student&rsquo;s own document store, not this case&rsquo;s files. It stays theirs — it
          follows them to their next case, and they can revoke your access to it.
        </p>

        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="student-doc-type">
            Document
          </label>
          <select
            id="student-doc-type"
            value={documentTypeId}
            onChange={(e) => setDocumentTypeId(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-sm text-body"
          >
            <option value="">Select a document…</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {selected?.description && <p className="text-caption text-text-secondary">{selected.description}</p>}
        </div>

        {/* Only an `instance` type takes a label — a passport does not need to be told apart from
            another passport, but "Instalment 2" absolutely does. */}
        {selected?.cardinality === 'instance' && (
          <div className="flex flex-col gap-xs">
            <label className="text-body-sm font-medium text-text-primary" htmlFor="student-doc-label">
              Which one is this?
            </label>
            <input
              id="student-doc-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Instalment 2, reference from Dr Rao…"
              className="rounded-md border border-border bg-surface px-3 py-sm text-body"
            />
          </div>
        )}

        {needsExpiry && (
          <div className="flex flex-col gap-xs">
            <label className="text-body-sm font-medium text-text-primary" htmlFor="student-doc-expiry">
              Expires on
            </label>
            <input
              id="student-doc-expiry"
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-sm text-body"
            />
            <p className="text-caption text-text-secondary">
              Required for this document, so the student can be warned before it lapses.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="student-doc-file">
            File
          </label>
          <input
            id="student-doc-file"
            type="file"
            accept={selected?.allowed_mime_types?.join(',')}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-body-sm"
          />
          {selected && (
            <p className="text-caption text-text-secondary">
              {selected.allowed_mime_types?.join(', ')} &middot; up to {selected.max_size_mb}MB
            </p>
          )}
        </div>

        {/* Said plainly, because replacing a document a colleague already checked is not obviously
            destructive from inside this modal. */}
        {selected?.cardinality === 'singleton' && (
          <p className="rounded-md bg-surface-muted px-3 py-sm text-caption text-text-secondary">
            This replaces any {selected.name.toLowerCase()} the student already has, and clears anyone&rsquo;s
            verification of it.
          </p>
        )}
      </div>
    </Modal>
  )
}

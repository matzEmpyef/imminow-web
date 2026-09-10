// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03).
// Reworked 2026-09-09 for the student-owned document locker.
import { useState } from 'react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useDownloadUrl, useUploadFile, useUploads } from '@/queries/uploads'
import { useStudentDocuments, type StudentDocument } from '@/queries/studentDocuments'
import { formatDate } from '@/lib/time'
import { ShareFromLibraryModal } from './ShareFromLibraryModal'
import { UploadStudentDocumentModal } from './UploadStudentDocumentModal'

/**
 * One tab, two groups — deliberately not sub-tabs (user, 2026-09-09). A consultant looking for
 * anything document-shaped should find it in one place.
 *
 * The two groups are genuinely different things, which is why they are separated rather than
 * merged into one list:
 *
 *   **The student's documents** belong to the STUDENT. They live in that student's locker, follow
 *   them to their next case and their next consultancy, and are visible here only because the
 *   student shared them. Verification is ours alone — another consultancy's tick never appears.
 *
 *   **Shared by us** is the consultancy's own work product going the other way: a drafted SOP, a
 *   checklist, an offer letter. It stays journey-scoped and is not the student's to carry away.
 */
export function DocumentsTab({ clientId }: { clientId: string }) {
  const uploads = useUploads(clientId)
  const studentDocs = useStudentDocuments(clientId)
  const uploadFile = useUploadFile(clientId)
  const downloadUrl = useDownloadUrl()
  const [showLibraryPicker, setShowLibraryPicker] = useState(false)
  const [showUploadForStudent, setShowUploadForStudent] = useState(false)

  // H10 fix (frontend review, 1 Sep 2026) — a failed fetch used to fall through to "No documents
  // sent yet." with no way to tell it apart from a genuinely empty tab.
  if (uploads.isLoading || studentDocs.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (uploads.isError) {
    return <ErrorState message="Could not load documents." onRetry={() => uploads.refetch()} />
  }

  // User-requested correction (2026-08-15): "Shared by us" is one-way. A student's own step
  // upload is not something this group can receive, so it is filtered out rather than mislabelled.
  const sentDocuments = uploads.data?.filter((doc) => doc.uploaded_by === 'consultant') ?? []
  const theirDocuments = studentDocs.data?.items ?? []

  return (
    <div className="flex flex-col gap-md">
      <Card className="flex flex-col gap-md">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h2 className="text-h3 text-text-primary">The student&rsquo;s documents</h2>
            <p className="text-body-sm text-text-secondary">
              Shared with you by the student. These belong to them and travel with them — they can
              revoke your access at any time.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => setShowUploadForStudent(true)}>
            Upload for them
          </Button>
        </div>

        {studentDocs.isError ? (
          <ErrorState message="Could not load the student's documents." onRetry={() => studentDocs.refetch()} />
        ) : theirDocuments.length === 0 ? (
          <p className="text-body-sm text-text-secondary">
            Nothing shared yet. Documents arrive when the student attaches one to a plan step, or when you upload one
            on their behalf.
          </p>
        ) : (
          <div className="flex flex-col gap-xs">
            {theirDocuments.map((doc) => (
              <StudentDocumentRow key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-md">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h2 className="text-h3 text-text-primary">Shared by us</h2>
            <p className="text-body-sm text-text-secondary">
              What you have sent the student — drafts, checklists, offer letters. One way.
            </p>
          </div>
          <div className="flex gap-sm">
            {/* User-requested (2026-08-15) — Send Document can also be an existing Document
                Library file, not just a fresh upload. */}
            <Button type="button" variant="secondary" onClick={() => setShowLibraryPicker(true)}>
              From Library
            </Button>
            <label>
              <span className="sr-only">Upload document</span>
              <input
                type="file"
                className="hidden"
                id="doc-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) uploadFile.mutate({ file })
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => document.getElementById('doc-upload')?.click()}
                loading={uploadFile.isPending}
              >
                Send Document
              </Button>
            </label>
          </div>
        </div>

        {sentDocuments.length === 0 && <p className="text-body-sm text-text-secondary">No documents sent yet.</p>}
        <div className="flex flex-col gap-xs">
          {sentDocuments.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between text-body-sm">
              <div>
                <p className="text-text-primary">{doc.filename}</p>
                <p className="text-caption text-text-secondary">Sent {formatDate(doc.created_at)}</p>
              </div>
              {/* Fetched the signed link and never opened it (found 2026-09-10) — the button did
                  nothing. The tab is opened on the click itself, so a pop-up blocker allows it,
                  then pointed at the file once the short-lived link arrives. */}
              <button
                onClick={() => {
                  const tab = window.open('', '_blank')
                  downloadUrl.mutate(doc.id, {
                    onSuccess: (url) => {
                      // No tab when the browser blocks new windows outright — open it here
                      // instead, so Download always does something.
                      if (!tab) {
                        window.location.assign(url)
                        return
                      }
                      tab.opener = null
                      tab.location.href = url
                    },
                    onError: () => tab?.close(),
                  })
                }}
                className="text-primary hover:underline"
              >
                Download
              </button>
            </div>
          ))}
        </div>
      </Card>

      {showLibraryPicker && <ShareFromLibraryModal clientId={clientId} onClose={() => setShowLibraryPicker(false)} />}
      {showUploadForStudent && (
        <UploadStudentDocumentModal clientId={clientId} onClose={() => setShowUploadForStudent(false)} />
      )}
    </div>
  )
}

function StudentDocumentRow({ doc }: { doc: StudentDocument }) {
  return (
    <div className="flex items-center justify-between gap-md text-body-sm">
      <div>
        <p className="text-text-primary">
          {doc.document_type_name ?? doc.filename}
          {doc.label && <span className="text-text-secondary"> &middot; {doc.label}</span>}
        </p>
        <p className="text-caption text-text-secondary">
          {doc.filename}
          {(doc.version ?? 1) > 1 && <span> &middot; v{doc.version}</span>}
          {doc.expires_on && <span> &middot; expires {formatDate(doc.expires_on)}</span>}
        </p>
      </div>
      <div className="flex items-center gap-sm">
        {/* Expiry beats verification in the hierarchy: a verified passport that has since run out
            is not a document anyone should be relying on. */}
        {doc.expired ? (
          <Badge color="warning">Expired</Badge>
        ) : doc.verified ? (
          <Badge color="success">Verified</Badge>
        ) : (
          // "Provided" and "checked" are different states, and conflating them is how a consultant
          // ends up trusting a document nobody at this consultancy has actually read.
          <Badge color="secondary">Not checked</Badge>
        )}
      </div>
    </div>
  )
}

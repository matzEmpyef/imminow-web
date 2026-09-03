// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03) — pure movement, no logic change.
import { useState } from 'react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useDownloadUrl, useUploadFile, useUploads } from '@/queries/uploads'
import { formatDate } from '@/lib/time'
import { ShareFromLibraryModal } from './ShareFromLibraryModal'

// User-requested correction (2026-08-15): this tab is a one-way method for the consultant to
// share documents with the applicant, not a general exchange — "for client to share any
// document they use a step in the plan" instead (a plan step's file_upload component, not this
// tab). So only `uploaded_by: 'consultant'` uploads are shown here; any `student`-origin uploads
// (which only ever arrive via a step submission, never through this tab's own "Send Document")
// are filtered out rather than mislabeled as something this tab can receive.
export function DocumentsTab({ clientId }: { clientId: string }) {
  const uploads = useUploads(clientId)
  const uploadFile = useUploadFile(clientId)
  const downloadUrl = useDownloadUrl()
  const [showLibraryPicker, setShowLibraryPicker] = useState(false)

  // H10 fix (frontend review, 1 Sep 2026) — a failed fetch used to fall through to "No documents
  // sent yet." with no way to tell it apart from a genuinely empty tab. Same early-return shape
  // CommissionsTab above already uses.
  if (uploads.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (uploads.isError) {
    return <ErrorState message="Could not load documents." onRetry={() => uploads.refetch()} />
  }
  const sentDocuments = uploads.data?.filter((doc) => doc.uploaded_by === 'consultant') ?? []

  return (
    <Card className="flex flex-col gap-md">
      <div className="flex items-center justify-between">
        <h2 className="text-h3 text-text-primary">Documents</h2>
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
      {showLibraryPicker && <ShareFromLibraryModal clientId={clientId} onClose={() => setShowLibraryPicker(false)} />}
      {sentDocuments.length === 0 && <p className="text-body-sm text-text-secondary">No documents sent yet.</p>}
      <div className="flex flex-col gap-xs">
        {sentDocuments.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between text-body-sm">
            <div>
              <p className="text-text-primary">{doc.filename}</p>
              <p className="text-caption text-text-secondary">Sent {formatDate(doc.created_at)}</p>
            </div>
            <button onClick={() => downloadUrl.mutate(doc.id)} className="text-primary hover:underline">
              Download
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}

// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03).
// Reworked 2026-09-09 for the student-owned document locker.
// Redesigned 2026-09-10 (user: "You need to improve the UI/UX of documents tab too"): a summary
// line, the two groups side by side, rows with a file-type icon, clear status badges and a real
// Download button, and actions that say what they do.
import { useState, type ReactNode } from 'react'
import { Download, File, FileImage, FileText, FolderOpen, Library, Send, Upload, UserRound } from 'lucide-react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { IconBadge } from '@/components/IconBadge'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useDownloadUrl, useUploadFile, useUploads } from '@/queries/uploads'
import { useStudentDocuments, type StudentDocument } from '@/queries/studentDocuments'
import { formatDate } from '@/lib/time'
import { ShareFromLibraryModal } from './ShareFromLibraryModal'
import { UploadStudentDocumentModal } from './UploadStudentDocumentModal'

/** A file-type icon from the name (and type, when known). */
function FileIcon({ filename, mimeType }: { filename?: string | null; mimeType?: string | null }) {
  const name = (filename ?? '').toLowerCase()
  const mime = mimeType ?? ''
  const Icon =
    mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/.test(name)
      ? FileImage
      : mime === 'application/pdf' || /\.(pdf|docx?|txt|rtf)$/.test(name)
        ? FileText
        : File
  const isPdf = mime === 'application/pdf' || name.endsWith('.pdf')
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
        isPdf ? 'bg-error/10 text-error' : Icon === FileImage ? 'bg-info/10 text-info' : 'bg-primary/10 text-primary'
      }`}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </span>
  )
}

function GroupHeader({
  icon,
  color,
  title,
  description,
  actions,
}: {
  icon: ReactNode
  color: 'primary' | 'secondary'
  title: string
  description: string
  actions: ReactNode
}) {
  return (
    <div className="flex flex-col gap-md">
      <div className="flex items-start gap-sm">
        <IconBadge color={color}>{icon}</IconBadge>
        <div className="min-w-0">
          <h2 className="text-h3 text-text-primary">{title}</h2>
          <p className="text-body-sm text-text-secondary">{description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-sm">{actions}</div>
    </div>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-xs rounded-md border border-dashed border-border px-md py-lg text-center">
      <FolderOpen className="h-6 w-6 text-text-secondary" aria-hidden />
      <p className="text-body-sm text-text-secondary">{children}</p>
    </div>
  )
}

/**
 * One tab, two groups — deliberately not sub-tabs (user, 2026-09-09). A consultant looking for
 * anything document-shaped should find it in one place.
 *
 *   **The student's documents** belong to the STUDENT. They live in that student's locker, follow
 *   them to their next case and their next consultancy, and are visible here only because the
 *   student shared them. Verification is ours alone — another consultancy's tick never appears.
 *
 *   **Shared by us** is the consultancy's own work product going the other way: a drafted SOP, a
 *   checklist, an offer letter. It stays with the case; the student sees it in the Sentpo app under
 *   My documents → From your consultancy, and is notified when one is shared (2026-09-10).
 */
export function DocumentsTab({ clientId }: { clientId: string }) {
  const uploads = useUploads(clientId)
  const studentDocs = useStudentDocuments(clientId)
  const uploadFile = useUploadFile(clientId)
  const downloadUrl = useDownloadUrl()
  const [showLibraryPicker, setShowLibraryPicker] = useState(false)
  const [showUploadForStudent, setShowUploadForStudent] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)

  // H10 fix (frontend review, 1 Sep 2026) — a failed fetch used to fall through to "No documents
  // sent yet." with no way to tell it apart from a genuinely empty tab.
  if (uploads.isLoading || studentDocs.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (uploads.isError) {
    return <ErrorState message="Could not load documents." onRetry={() => uploads.refetch()} />
  }

  // "Shared by us" is one-way. A student's own step upload is not something this group can receive,
  // so it is filtered out rather than mislabelled (user-requested correction, 2026-08-15).
  const sentDocuments = uploads.data?.filter((doc) => doc.uploaded_by === 'consultant') ?? []
  const theirDocuments = studentDocs.data?.items ?? []
  const verified = theirDocuments.filter((d) => d.verified && !d.expired).length
  const expired = theirDocuments.filter((d) => d.expired).length

  // The tab is opened on the click itself, so a pop-up blocker allows it, then pointed at the file
  // once the short-lived signed link arrives; a browser that blocks new windows outright gets the
  // file in this tab instead, so Download always does something (fixed 2026-09-10).
  function openUpload(uploadId: string) {
    const tab = window.open('', '_blank')
    setOpeningId(uploadId)
    downloadUrl.mutate(uploadId, {
      onSuccess: (url) => {
        if (!tab) {
          window.location.assign(url)
          return
        }
        tab.opener = null
        tab.location.href = url
      },
      onError: () => tab?.close(),
      onSettled: () => setOpeningId(null),
    })
  }

  return (
    <div className="flex flex-col gap-md">
      {/* The whole tab in one line, before the detail. */}
      <div className="flex flex-wrap items-center gap-x-md gap-y-xs text-body-sm text-text-secondary">
        <span>
          <span className="font-medium text-text-primary">{theirDocuments.length}</span> from the student
        </span>
        {verified > 0 && <Badge color="success">{verified} verified</Badge>}
        {expired > 0 && <Badge color="warning">{expired} expired</Badge>}
        <span aria-hidden>·</span>
        <span>
          <span className="font-medium text-text-primary">{sentDocuments.length}</span> shared by you
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-md lg:grid-cols-2">
        <Card className="flex flex-col gap-md">
          <GroupHeader
            icon={<UserRound className="h-5 w-5" />}
            color="primary"
            title="The student's documents"
            description="Shared with you by the student. They belong to the student and travel with them — the student can revoke your access at any time."
            actions={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowUploadForStudent(true)}
                className="inline-flex items-center gap-xs"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden />
                Upload on their behalf
              </Button>
            }
          />

          {studentDocs.isError ? (
            <ErrorState message="Could not load the student's documents." onRetry={() => studentDocs.refetch()} />
          ) : theirDocuments.length === 0 ? (
            <EmptyState>
              Nothing shared yet. Documents arrive when the student attaches one to a plan step, or when you upload one
              on their behalf.
            </EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {theirDocuments.map((doc) => (
                <StudentDocumentRow key={doc.id} doc={doc} />
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col gap-md">
          <GroupHeader
            icon={<Send className="h-5 w-5" />}
            color="secondary"
            title="Shared by us"
            description="What you have sent the student — drafts, checklists, offer letters. They see it in the Sentpo app under My documents, and get a notification."
            actions={
              <>
                <input
                  type="file"
                  className="hidden"
                  id="doc-upload"
                  aria-label="Choose a document to send"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) uploadFile.mutate({ file })
                    e.target.value = ''
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => document.getElementById('doc-upload')?.click()}
                  loading={uploadFile.isPending}
                  className="inline-flex items-center gap-xs"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden />
                  Send a document
                </Button>
                {/* Send can also be an existing Document Library file (user-requested, 2026-08-15). */}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowLibraryPicker(true)}
                  className="inline-flex items-center gap-xs"
                >
                  <Library className="h-3.5 w-3.5" aria-hidden />
                  From Library
                </Button>
              </>
            }
          />
          {uploadFile.isError && <p className="text-body-sm text-error">{uploadFile.error.message}</p>}

          {sentDocuments.length === 0 ? (
            <EmptyState>Nothing sent yet. Send a document, or share one from your Document Library.</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {sentDocuments.map((doc) => (
                <li key={doc.id} className="flex items-center gap-sm py-sm">
                  <FileIcon filename={doc.filename} mimeType={doc.mime_type} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-body-sm font-medium text-text-primary">{doc.filename}</p>
                    <p className="flex flex-wrap items-center gap-xs text-caption text-text-secondary">
                      Sent {formatDate(doc.created_at)}
                      {doc.source_library_document_id && <Badge color="info">From Library</Badge>}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={openingId === doc.id}
                    onClick={() => openUpload(doc.id)}
                    aria-label={`Download ${doc.filename}`}
                    className="inline-flex shrink-0 items-center gap-xs"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    Download
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {showLibraryPicker && <ShareFromLibraryModal clientId={clientId} onClose={() => setShowLibraryPicker(false)} />}
      {showUploadForStudent && (
        <UploadStudentDocumentModal clientId={clientId} onClose={() => setShowUploadForStudent(false)} />
      )}
    </div>
  )
}

function StudentDocumentRow({ doc }: { doc: StudentDocument }) {
  return (
    <li className="flex items-center gap-sm py-sm">
      <FileIcon filename={doc.filename} mimeType={doc.mime_type} />
      <div className="min-w-0 flex-1">
        <p className="break-words text-body-sm font-medium text-text-primary">
          {doc.document_type_name ?? doc.filename}
          {doc.label && <span className="font-normal text-text-secondary"> &middot; {doc.label}</span>}
        </p>
        <p className="text-caption text-text-secondary">
          {doc.filename}
          {(doc.version ?? 1) > 1 && <span> &middot; v{doc.version}</span>}
          {doc.expires_on && <span> &middot; expires {formatDate(doc.expires_on)}</span>}
        </p>
      </div>
      {/* Expiry beats verification: a verified passport that has since run out is not a document
          anyone should be relying on. "Provided" and "checked" are different states, and
          conflating them is how a consultant ends up trusting a document nobody here has read. */}
      {doc.expired ? (
        <Badge color="warning" className="shrink-0">
          Expired
        </Badge>
      ) : doc.verified ? (
        <Badge color="success" className="shrink-0">
          Verified
        </Badge>
      ) : (
        <Badge color="secondary" className="shrink-0">
          Not checked
        </Badge>
      )}
    </li>
  )
}

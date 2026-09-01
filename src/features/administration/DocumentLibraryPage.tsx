import { useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { TagEditorMenu } from '@/components/TagEditorMenu'
import { ShareDocumentMenu } from '@/components/ShareDocumentMenu'
import {
  useDeleteLibraryDocument,
  useDocumentLibrary,
  useDownloadLibraryDocumentUrl,
  useSetLibraryDocumentTags,
  useShareLibraryDocument,
  useUploadLibraryDocument,
} from '@/queries/documentLibrary'
import { useClients } from '@/queries/clients'
import { useCreateTag, useTags } from '@/queries/tags'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate } from '@/lib/time'

type LibraryDocument = NonNullable<ReturnType<typeof useDocumentLibrary>['data']>['items'][number]

const MIME_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
}

function mimeLabel(mimeType: string | null | undefined) {
  if (!mimeType) return 'File'
  return MIME_LABELS[mimeType] ?? mimeType
}

// Row-level so the confirm-delete popup's own useState has somewhere to live — TableColumn's
// render callback isn't a component body, hooks can't go directly inside it. Same shape as
// FormsPage.tsx's FormRowActions.
function DocumentRowActions({
  doc,
  clients,
  onShare,
}: {
  doc: LibraryDocument
  clients: { id: string; name: string }[]
  onShare: (journeyId: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const downloadUrl = useDownloadLibraryDocumentUrl()
  const deleteDocument = useDeleteLibraryDocument()

  return (
    <div className="flex justify-end">
      <ShareDocumentMenu clients={clients} onSelect={onShare} label={`Share ${doc.filename} with an applicant`} />
      <button
        type="button"
        onClick={() => downloadUrl.mutate(doc.id)}
        aria-label={`Download ${doc.filename}`}
        title="Download"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
      >
        <Download className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        aria-label={`Delete ${doc.filename}`}
        title="Delete"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {confirmDelete && (
        <Modal
          onClose={() => setConfirmDelete(false)}
          title="Delete Document"
          widthRem={24}
          footer={
            <div className="flex justify-end gap-sm">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={deleteDocument.isPending}
                onClick={() => deleteDocument.mutate(doc.id, { onSuccess: () => setConfirmDelete(false) })}
              >
                Delete
              </Button>
            </div>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Remove <span className="font-medium text-text-primary">{doc.filename}</span> from the library? This won't
            affect any copy already shared with an applicant.
          </p>
        </Modal>
      )}
    </div>
  )
}

export function DocumentLibraryPage() {
  const [tag, setTag] = useState('')
  const [mimeType, setMimeType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const paging = useCursorPagination()

  const documents = useDocumentLibrary({
    tag: tag || undefined,
    mimeType: mimeType || undefined,
    from: from || undefined,
    to: to || undefined,
    search: search || undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })
  // T2: the share menu offers the complete applicant roster — default limit 20 made
  // applicant 21 unshareable.
  const clients = useClients({ limit: 100 })
  const tags = useTags()
  const createTag = useCreateTag()
  const setDocumentTags = useSetLibraryDocumentTags()
  const shareDocument = useShareLibraryDocument()
  const uploadDocument = useUploadLibraryDocument()

  const clientOptions = (clients.data?.items ?? []).map((c) => ({
    id: c.id,
    name: `${c.student.first_name} ${c.student.last_name}`,
  }))

  function resetPaging() {
    paging.reset()
  }

  const columns: TableColumn<LibraryDocument>[] = [
    {
      key: 'filename',
      header: 'Filename',
      sortable: true,
      render: (doc) => <span className="font-medium text-text-primary">{doc.filename}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (doc) => <Badge color="secondary">{mimeLabel(doc.mime_type)}</Badge>,
    },
    {
      key: 'uploaded_by',
      header: 'Uploaded by',
      render: (doc) => <span className="text-text-secondary">{doc.uploaded_by_employee_name ?? '—'}</span>,
    },
    {
      key: 'created_at',
      header: 'Uploaded',
      sortable: true,
      render: (doc) => <span className="text-text-secondary">{formatDate(doc.created_at)}</span>,
    },
    {
      key: 'tags',
      header: 'Tags',
      render: (doc) => (
        <div className="flex items-center gap-xs">
          <div className="flex flex-wrap gap-xs">
            {doc.tags?.map((t) => (
              <Badge key={t} color="secondary">
                {t}
              </Badge>
            ))}
          </div>
          <TagEditorMenu
            tags={doc.tags ?? []}
            catalog={tags.data ?? []}
            onCreateTag={(name) => createTag.mutateAsync(name)}
            onSave={(next) => setDocumentTags.mutate({ id: doc.id, tags: next })}
            saving={setDocumentTags.isPending}
            label={`Edit tags for ${doc.filename}`}
          />
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (doc) => (
        <DocumentRowActions
          doc={doc}
          clients={clientOptions}
          onShare={(journeyId) => shareDocument.mutate({ id: doc.id, journeyId })}
        />
      ),
    },
  ]

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between gap-md">
          <div>
            <h1 className="text-h1 text-text-primary">Document Library</h1>
            <p className="text-body-sm text-text-secondary">
              Common documents your consultancy can share with any applicant.
            </p>
          </div>
          <label>
            <span className="sr-only">Upload document</span>
            <input
              type="file"
              className="hidden"
              id="library-doc-upload"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadDocument.mutate(file)
                e.target.value = ''
              }}
            />
            <Button
              type="button"
              onClick={() => document.getElementById('library-doc-upload')?.click()}
              loading={uploadDocument.isPending}
            >
              Upload Document
            </Button>
          </label>
        </div>

        {/* T7 (third-pass review): a failed upload or share used to vanish without a trace —
            the button just returned to rest with the file absent, or the share modal closed
            over a 409 the consultant never saw. */}
        {uploadDocument.isError && (
          <p className="text-body-sm text-error">{uploadDocument.error.message}</p>
        )}
        {shareDocument.isError && <p className="text-body-sm text-error">{shareDocument.error.message}</p>}

        <Table
          columns={columns}
          rows={documents.data?.items ?? []}
          rowKey={(doc) => doc.id}
          loading={documents.isLoading}
          error={documents.isError ? 'Could not load the document library.' : undefined}
          emptyMessage="No documents match these filters."
          sort={sort}
          onSortChange={(field, direction) => {
            setSort({ field, direction })
            resetPaging()
          }}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value)
              resetPaging()
            },
            placeholder: 'Search filenames…',
          }}
          filters={
            <>
              <select
                value={tag}
                onChange={(e) => {
                  setTag(e.target.value)
                  resetPaging()
                }}
                className="h-9 rounded-md border border-border bg-background px-3 text-body-sm"
              >
                <option value="">All tags</option>
                {tags.data?.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select
                value={mimeType}
                onChange={(e) => {
                  setMimeType(e.target.value)
                  resetPaging()
                }}
                className="h-9 rounded-md border border-border bg-background px-3 text-body-sm"
              >
                <option value="">All types</option>
                <option value="application/pdf">PDF</option>
                <option value="image/jpeg">JPEG</option>
                <option value="image/png">PNG</option>
              </select>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value)
                  resetPaging()
                }}
                className="h-9 rounded-md border border-border bg-background px-3 text-body-sm"
              />
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value)
                  resetPaging()
                }}
                className="h-9 rounded-md border border-border bg-background px-3 text-body-sm"
              />
            </>
          }
          pagination={{
            hasNext: Boolean(documents.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => documents.data?.meta.next_cursor && paging.next(documents.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: documents.data?.meta.total,
          }}
        />
      </div>
    </AppShell>
  )
}

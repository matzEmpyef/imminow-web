import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ProgressBar } from '@/components/ProgressBar'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { formatDateTime } from '@/lib/time'
import { isInProgress, useCatalogImport, type CatalogImport } from '@/queries/catalogImports'
import { ImportApply, ImportErrors, ImportRows, ImportSummary, ServerNotice, UploadAgainLink } from './ImportPreview'
import { UndoImportModal } from './UndoImportModal'
import { UndoReport } from './UndoReport'
import { IMPORT_HOME, SHEET_LABEL, importState } from './catalogImportWords'

const PHASE_LABEL = {
  check: 'Checking your file',
  apply: 'Applying the import',
  undo: 'Undoing the import',
} as const

const STATUS_PHASE = { checking: 'check', applying: 'apply', undoing: 'undo' } as const

/**
 * One import, from check to apply to undo (bulk import plan, owner-approved 2026-10-09). The page
 * follows the import while the server works on it (a progress bar, asked every two seconds, paused
 * while the tab is hidden) and shows what the server reports at each state:
 *
 *   checking / applying / undoing   progress
 *   ready                           the preview: counts, things to fix, near matches to tick, rows, Apply
 *   applied                         the result, with Undo while the server offers it
 *   failed / stale                  the server's sentence, and "Upload again"
 *   undone                          the undo report
 *
 * Every sentence about the file is the server's own. Nothing here decides what is valid.
 */
export function CatalogImportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const query = useCatalogImport(id)
  const item = query.data

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-start gap-sm">
          <Link
            to={IMPORT_HOME}
            aria-label="Back to Import"
            title="Back to Import"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-sm">
              <h1 className="break-all text-h1 text-text-primary">{item?.file_name ?? 'Import'}</h1>
              {item && <Badge color={importState(item).color}>{importState(item).label}</Badge>}
            </div>
            {item && (
              <p className="text-body-sm text-text-secondary">
                Uploaded{item.uploaded_by ? ` by ${item.uploaded_by.name}` : ''} on {formatDateTime(item.created_at)}
                {item.csv_sheet ? ` · ${SHEET_LABEL[item.csv_sheet]} sheet` : ''}
              </p>
            )}
          </div>
        </div>

        {!item && query.isLoading && <Skeleton className="h-40 rounded-lg" />}
        {!item && query.isError && (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} error={query.error} />
        )}
        {item && <ImportBody key={item.id} item={item} checkFailed={query.isError} />}
      </div>
    </AdminShell>
  )
}

function ImportBody({ item, checkFailed }: { item: CatalogImport; checkFailed: boolean }) {
  const [confirmUndo, setConfirmUndo] = useState(false)

  if (isInProgress(item)) {
    const phase = item.progress?.phase ?? STATUS_PHASE[item.status as keyof typeof STATUS_PHASE]
    return (
      <Card className="flex flex-col gap-md">
        <ProgressBar
          label={PHASE_LABEL[phase]}
          percent={item.progress?.percent ?? 0}
          done={item.progress?.done}
          total={item.progress?.total}
        />
        {item.message && <p className="text-body-sm text-text-primary">{item.message}</p>}
        <p className="text-caption text-text-secondary">
          {checkFailed
            ? 'We could not reach the server just now. We will keep trying.'
            : 'You can leave this page. The work carries on, and the import stays in the history.'}
        </p>
      </Card>
    )
  }

  if (item.status === 'failed' || item.status === 'stale') {
    return (
      <ServerNotice tone={item.status === 'failed' ? 'error' : 'warning'} action={<UploadAgainLink primary />}>
        {item.message ??
          (item.status === 'failed' ? 'This file could not be read.' : 'This import was not applied. Nothing was saved.')}
      </ServerNotice>
    )
  }

  const purgedNote = (
    <p className="text-body-sm text-text-secondary">
      The uploaded file and its preview are no longer kept. This line stays in the history.
    </p>
  )

  if (item.status === 'undone') {
    return (
      <>
        <ServerNotice tone="info">
          {item.message ?? 'This import was undone.'}
          {item.undone_at
            ? ` Undone${item.undone_by ? ` by ${item.undone_by.name}` : ''} on ${formatDateTime(item.undone_at)}.`
            : ''}
        </ServerNotice>
        <UndoReport item={item} />
      </>
    )
  }

  if (item.status === 'applied') {
    return (
      <>
        <ServerNotice
          tone="success"
          action={
            item.can_undo ? (
              <div className="flex flex-col items-end gap-0.5">
                <Button variant="secondary" onClick={() => setConfirmUndo(true)}>
                  Undo this import
                </Button>
                {item.undo_until && (
                  <span className="text-caption text-text-secondary">until {formatDateTime(item.undo_until)}</span>
                )}
              </div>
            ) : undefined
          }
        >
          {item.message ?? 'This import was applied.'}
          {item.applied_at
            ? ` Applied${item.applied_by ? ` by ${item.applied_by.name}` : ''} on ${formatDateTime(item.applied_at)}.`
            : ''}
        </ServerNotice>
        <ImportSummary item={item} />
        {item.purged ? purgedNote : <ImportRows item={item} />}
        {confirmUndo && (
          // The undo's answer (202, `undoing`) is written into this page's own query, so the
          // progress bar takes over as soon as the dialog closes.
          <UndoImportModal item={item} onClose={() => setConfirmUndo(false)} onStarted={() => setConfirmUndo(false)} />
        )}
      </>
    )
  }

  // ready: the preview.
  const errors = item.summary?.errors ?? 0
  return (
    <>
      {item.already_imported && <ServerNotice tone="info">{item.already_imported.message}</ServerNotice>}
      {item.message && !item.already_imported && <p className="text-body-sm text-text-primary">{item.message}</p>}
      <ImportSummary item={item} />
      {item.purged ? (
        purgedNote
      ) : (
        <>
          {errors > 0 && <ImportErrors item={item} />}
          <ImportApply item={item} />
          <ImportRows item={item} />
        </>
      )}
    </>
  )
}

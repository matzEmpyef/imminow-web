import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, FileSpreadsheet } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { FileDropArea } from '@/components/FileDropArea'
import { SelectField } from '@/components/SelectField'
import { ServerSearchSelect } from '@/components/ServerSearchSelect'
import { StopPropagation } from '@/components/StopPropagation'
import { Table, type TableColumn } from '@/components/Table'
import { formatCount } from '@/lib/counts'
import { cursorPager, useCursorPagination } from '@/lib/pagination'
import { showToast } from '@/lib/toast'
import { formatDateTime } from '@/lib/time'
import { ALREADY_APPLIED_NOTICE, isAlreadyApplied, usePayloadIdempotencyKey } from '@/lib/useIdempotencyKey'
import { collegeSource } from '@/queries/pickerSources'
import {
  useCatalogImports,
  useDownloadCatalogImportFile,
  useUploadCatalogImport,
  type CatalogImport,
  type CatalogImportSheet,
} from '@/queries/catalogImports'
import { HowToFillModal } from './HowToFillModal'
import { UndoImportModal } from './UndoImportModal'
import { SHEETS, SHEET_LABEL, importPath, importStateColor } from './catalogImportWords'

/** Only what picks the sheet picker: a CSV file holds one sheet, and the server must be told which. */
function isCsv(file: File): boolean {
  return file.name.toLowerCase().endsWith('.csv')
}

/**
 * Catalogue → Import campuses and courses (bulk import plan, owner-approved 2026-10-09). Three
 * things on one page: get the workbook (empty, or filled with the current catalogue), upload it
 * back, and the history of every import with its Undo.
 *
 * The upload is only handed to the server. It is checked there in the background, and the import's
 * own page (`CatalogImportDetailPage`) follows the check and shows the preview.
 */
export function CatalogImportPage() {
  const navigate = useNavigate()
  const [showHowTo, setShowHowTo] = useState(false)

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-start gap-sm">
          <Link
            to="/admin/colleges"
            aria-label="Back to Colleges & Courses"
            title="Back to Colleges & Courses"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-h1 text-text-primary">Import campuses and courses</h1>
            <p className="text-body-sm text-text-secondary">
              Add or update many campuses and courses with one spreadsheet. You see a preview before anything is saved.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
          <WorkbookCard onTemplateDownloaded={() => setShowHowTo(true)} onHowTo={() => setShowHowTo(true)} />
          <UploadCard onUploaded={(created) => navigate(importPath(created.id))} />
        </div>

        <ImportHistory />
      </div>

      {showHowTo && <HowToFillModal onClose={() => setShowHowTo(false)} />}
    </AdminShell>
  )
}

function StepHeading({ step, title, note }: { step: number; title: string; note: string }) {
  return (
    <div className="flex items-start gap-sm">
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-body-sm font-medium text-primary"
      >
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-h2 text-text-primary">{title}</h2>
        <p className="text-body-sm text-text-secondary">{note}</p>
      </div>
    </div>
  )
}

function WorkbookCard({ onTemplateDownloaded, onHowTo }: { onTemplateDownloaded: () => void; onHowTo: () => void }) {
  const template = useDownloadCatalogImportFile()
  const catalogue = useDownloadCatalogImportFile()
  const [collegeId, setCollegeId] = useState('')

  return (
    <Card className="flex flex-col gap-md">
      <StepHeading
        step={1}
        title="Get the spreadsheet"
        note="Start from the empty template, or download what is in the catalogue now and edit it."
      />

      <div className="flex flex-col gap-xs">
        <div className="flex flex-wrap items-center gap-md">
          <Button
            loading={template.isPending}
            onClick={() => template.mutate({ kind: 'template' }, { onSuccess: onTemplateDownloaded })}
          >
            <span className="inline-flex items-center gap-xs">
              <Download className="h-4 w-4" aria-hidden />
              Download template
            </span>
          </Button>
          <button type="button" onClick={onHowTo} className="text-body-sm font-medium text-primary hover:underline">
            How to fill it
          </button>
        </div>
        {template.isError && (
          <p role="alert" className="text-body-sm text-error">
            {template.error.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-sm border-t border-border pt-md">
        <p className="text-body-sm font-medium text-text-primary">Current catalogue</p>
        <p className="text-caption text-text-secondary">
          The same spreadsheet, filled in. Pick a college to get only its campuses and courses.
        </p>
        <div className="flex flex-wrap items-start gap-sm">
          <div className="flex-1" style={{ minWidth: '14rem' }}>
            <ServerSearchSelect
              source={collegeSource}
              value={collegeId}
              onChange={(id) => {
                setCollegeId(id)
                catalogue.reset()
              }}
              label="College (optional)"
              placeholder="All colleges"
            />
          </div>
          <Button
            variant="secondary"
            className="mt-xs shrink-0"
            loading={catalogue.isPending}
            onClick={() => catalogue.mutate({ kind: 'catalogue', collegeId: collegeId || undefined })}
          >
            <span className="inline-flex items-center gap-xs">
              <Download className="h-4 w-4" aria-hidden />
              Download current catalogue
            </span>
          </Button>
        </div>
        {catalogue.isError && (
          <p role="alert" className="text-body-sm text-error">
            {catalogue.error.message}
          </p>
        )}
      </div>
    </Card>
  )
}

function UploadCard({ onUploaded }: { onUploaded: (created: CatalogImport) => void }) {
  const upload = useUploadCatalogImport()
  // One key per chosen file (as for the college CSV import): pressing the button again after a
  // lost reply replays the first answer instead of uploading twice; a clear refusal renews it.
  const idempotency = usePayloadIdempotencyKey()
  const [file, setFile] = useState<File | null>(null)
  const [sheet, setSheet] = useState<CatalogImportSheet | ''>('')
  const csv = file != null && isCsv(file)

  function submit(chosen: File) {
    const sheetFor = isCsv(chosen) && sheet ? sheet : undefined
    upload.mutate(
      {
        file: chosen,
        sheet: sheetFor,
        idempotencyKey: idempotency.keyFor({
          name: chosen.name,
          size: chosen.size,
          modified: chosen.lastModified,
          sheet: sheetFor ?? null,
        }),
      },
      {
        onSuccess: onUploaded,
        onError: (err) => {
          idempotency.settle(err)
          if (isAlreadyApplied(err)) showToast(ALREADY_APPLIED_NOTICE)
        },
      },
    )
  }

  function choose(next: File) {
    upload.reset()
    setFile(next)
    setSheet('')
  }

  return (
    <Card id="upload" className="flex flex-col gap-md">
      <StepHeading
        step={2}
        title="Upload your file"
        note="We check it first and show you a preview. Nothing is saved until you press Apply."
      />

      <FileDropArea
        label={file ? 'Choose another file' : 'Drop your file here, or click to choose it'}
        hint="Excel (.xlsx), or one sheet saved as CSV UTF-8 (.csv)"
        accept=".xlsx,.csv"
        onFile={choose}
        disabled={upload.isPending}
      />

      {file && (
        <div className="flex flex-col gap-md rounded-md border border-border p-md">
          <div className="flex items-center gap-sm">
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-success" aria-hidden />
            <p className="min-w-0 break-all text-body-sm font-medium text-text-primary">{file.name}</p>
          </div>
          {csv && (
            <SelectField
              label="Which sheet is this file?"
              value={sheet}
              onChange={(e) => setSheet(e.target.value as CatalogImportSheet | '')}
            >
              <option value="">Choose a sheet</option>
              {SHEETS.map((key) => (
                <option key={key} value={key}>
                  {SHEET_LABEL[key]}
                </option>
              ))}
            </SelectField>
          )}
          {upload.isError && (
            <p role="alert" className="text-body-sm text-error">
              {upload.error.message}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              loading={upload.isPending}
              disabled={csv && !sheet}
              onClick={() => submit(file)}
            >
              Upload and check
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function CountsCell({ item }: { item: CatalogImport }) {
  const summary = item.summary
  if (!summary) return <span className="text-text-secondary">—</span>
  return (
    <div className="flex flex-col">
      <span className="text-text-primary">
        {formatCount(summary.new)} new · {formatCount(summary.changed)} changed · {formatCount(summary.unchanged)}{' '}
        unchanged
      </span>
      {(summary.errors > 0 || summary.warnings > 0) && (
        <span className="text-caption text-text-secondary">
          {[
            summary.errors > 0 ? `${formatCount(summary.errors)} to fix` : null,
            summary.warnings > 0 ? `${formatCount(summary.warnings)} near ${summary.warnings === 1 ? 'match' : 'matches'}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
    </div>
  )
}

/** Every import, newest first, a page at a time; Undo where the server offers it. */
function ImportHistory() {
  const navigate = useNavigate()
  const paging = useCursorPagination()
  const history = useCatalogImports({ cursor: paging.cursor, limit: 20 })
  const [undoing, setUndoing] = useState<CatalogImport | null>(null)

  const columns: TableColumn<CatalogImport>[] = [
    {
      key: 'file',
      header: 'File',
      render: (item) => (
        <div className="flex min-w-0 flex-col">
          <span className="break-all font-medium text-text-primary">{item.file_name}</span>
          {item.csv_sheet && <span className="text-caption text-text-secondary">{SHEET_LABEL[item.csv_sheet]} sheet</span>}
        </div>
      ),
    },
    {
      key: 'who',
      header: 'Uploaded by',
      render: (item) => (
        <div className="flex flex-col">
          <span>{item.uploaded_by?.name ?? '—'}</span>
          <span className="text-caption text-text-secondary">{formatDateTime(item.created_at)}</span>
        </div>
      ),
    },
    { key: 'counts', header: 'Rows', hideBelow: 'md', render: (item) => <CountsCell item={item} /> },
    {
      key: 'state',
      header: 'State',
      render: (item) => <Badge color={importStateColor(item)}>{item.state_label}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (item) =>
        item.can_undo ? (
          <StopPropagation className="flex flex-col items-end gap-0.5">
            <Button variant="secondary" size="sm" onClick={() => setUndoing(item)} aria-label={`Undo ${item.file_name}`}>
              Undo
            </Button>
            {item.undo_until && (
              <span className="text-caption text-text-secondary">until {formatDateTime(item.undo_until)}</span>
            )}
          </StopPropagation>
        ) : null,
    },
  ]

  return (
    <div className="flex flex-col gap-sm">
      <h2 className="text-h2 text-text-primary">Import history</h2>
      <Table
        columns={columns}
        rows={history.data?.items ?? []}
        rowKey={(item) => item.id}
        loading={history.isLoading}
        error={history.isError ? history.error.message : undefined}
        errorSource={history.error}
        emptyMessage="No imports yet. Your uploads will be listed here."
        onRowClick={(item) => navigate(importPath(item.id))}
        pagination={cursorPager(paging, history.data?.meta)}
      />
      {undoing && (
        <UndoImportModal
          item={undoing}
          onClose={() => setUndoing(null)}
          onStarted={(started) => navigate(importPath(started.id))}
        />
      )}
    </div>
  )
}

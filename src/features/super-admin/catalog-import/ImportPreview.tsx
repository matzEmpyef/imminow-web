import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Download, Info } from 'lucide-react'
import { ApiError } from '@/api/errors'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { FilterChip } from '@/components/FilterChip'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { TabBar, type TabBarItem } from '@/components/TabBar'
import { Table, type TableColumn } from '@/components/Table'
import { countOf, formatCount } from '@/lib/counts'
import { cursorPager, useCursorPagination } from '@/lib/pagination'
import {
  useApplyCatalogImport,
  useCatalogImportErrors,
  useCatalogImportRows,
  useCatalogImportWarnings,
  useDownloadCatalogImportFile,
  type CatalogImport,
  type CatalogImportError,
  type CatalogImportRow,
  type CatalogImportRowKind,
  type CatalogImportSheet,
  type CatalogImportWarning,
} from '@/queries/catalogImports'
import { IMPORT_HOME, KINDS, KIND_COLOR, KIND_LABEL, SHEET_LABEL } from './catalogImportWords'

/** Rows asked for at a time. The file may hold 20,000; the screen never holds more than a page. */
const ROWS_PAGE = 50
const ERRORS_PAGE = 50

/** A link to the upload area, as a button: for "this file will not do, send another". */
export function UploadAgainLink({ primary = false }: { primary?: boolean }) {
  return (
    <Link
      to={`${IMPORT_HOME}#upload`}
      className={`inline-flex h-10 items-center rounded-full px-5 text-button font-medium ${
        primary
          ? 'bg-primary text-text-on-primary shadow-card hover:opacity-90'
          : 'border border-border bg-surface text-text-primary hover:bg-background'
      }`}
    >
      Upload again
    </Link>
  )
}

/** A sentence from the server, shown as it is, in a tinted panel. */
export function ServerNotice({
  tone,
  children,
  action,
}: {
  tone: 'info' | 'warning' | 'error' | 'success'
  children: ReactNode
  action?: ReactNode
}) {
  const look = {
    info: 'border-info bg-info/10',
    warning: 'border-warning bg-warning/10',
    error: 'border-error bg-error/10',
    success: 'border-success bg-success/10',
  }[tone]
  const Icon = tone === 'info' || tone === 'success' ? Info : AlertTriangle
  const iconTone = { info: 'text-info', warning: 'text-warning', error: 'text-error', success: 'text-success' }[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex flex-wrap items-center justify-between gap-md rounded-md border px-md py-sm ${look}`}
    >
      <div className="flex min-w-0 items-start gap-sm">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconTone}`} aria-hidden />
        <p className="min-w-0 text-body-sm text-text-primary">{children}</p>
      </div>
      {action}
    </div>
  )
}

/** The counts per sheet, as the server counted them. */
export function ImportSummary({ item }: { item: CatalogImport }) {
  const summary = item.summary
  if (!summary) return null
  const tiles: { label: string; value: number; tone: string }[] = [
    { label: 'New', value: summary.new, tone: 'text-success' },
    { label: 'Changed', value: summary.changed, tone: 'text-info' },
    { label: 'Unchanged', value: summary.unchanged, tone: 'text-text-primary' },
    { label: 'To fix', value: summary.errors, tone: summary.errors > 0 ? 'text-error' : 'text-text-primary' },
  ]
  return (
    <Card className="flex flex-col gap-md">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2 className="text-h2 text-text-primary">What this file would do</h2>
        <p className="text-body-sm text-text-secondary">{countOf(summary.rows, false, 'row')} read</p>
      </div>
      <div className="grid grid-cols-2 gap-md sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-md bg-background px-md py-sm">
            <p className="text-caption text-text-secondary">{tile.label}</p>
            <p className={`text-h1 ${tile.tone}`}>{formatCount(tile.value)}</p>
          </div>
        ))}
      </div>
      {summary.sheets.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <caption className="sr-only">Rows per sheet</caption>
            <thead className="text-caption text-text-secondary">
              <tr>
                <th scope="col" className="px-sm py-xs text-left font-medium">
                  Sheet
                </th>
                {['Rows', 'New', 'Changed', 'Unchanged', 'To fix'].map((heading) => (
                  <th key={heading} scope="col" className="px-sm py-xs text-right font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.sheets.map((sheet) => (
                <tr key={sheet.sheet} className="border-t border-border">
                  <th scope="row" className="px-sm py-xs text-left font-medium text-text-primary">
                    {SHEET_LABEL[sheet.sheet]}
                  </th>
                  <td className="px-sm py-xs text-right">{formatCount(sheet.rows)}</td>
                  <td className="px-sm py-xs text-right">{formatCount(sheet.new)}</td>
                  <td className="px-sm py-xs text-right">{formatCount(sheet.changed)}</td>
                  <td className="px-sm py-xs text-right">{formatCount(sheet.unchanged)}</td>
                  <td className={`px-sm py-xs text-right ${sheet.errors > 0 ? 'font-medium text-error' : ''}`}>
                    {formatCount(sheet.errors)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/** A web address from the file, opened in a new tab. Anything that is not http(s) stays plain text. */
function CellValue({ value, link }: { value: string; link?: boolean }) {
  if (link && /^https?:\/\//i.test(value.trim())) {
    return (
      <a href={value.trim()} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
        {value}
      </a>
    )
  }
  return <span className="break-words">{value}</span>
}

type Change = CatalogImportRow['changes'][number]

function ChangeLine({ change, kind }: { change: Change; kind: CatalogImportRowKind }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-sm gap-y-0.5">
      <span className="text-caption font-medium text-text-secondary">{change.column}</span>
      {kind === 'changed' && (
        <>
          <span className="text-text-secondary line-through">
            <span className="sr-only">was </span>
            {change.old == null ? <span className="italic">empty</span> : <CellValue value={change.old} link={change.link} />}
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 self-center text-text-secondary" aria-label="becomes" />
        </>
      )}
      <span className="font-medium text-text-primary">
        {change.new == null ? <span className="italic">emptied</span> : <CellValue value={change.new} link={change.link} />}
      </span>
    </li>
  )
}

/**
 * What one row would do. A changed row lists each field with its old and new value. A new row can
 * fill forty columns, so its fields open on request.
 */
function RowChanges({ row }: { row: CatalogImportRow }) {
  const [open, setOpen] = useState(false)
  if (row.changes.length === 0) {
    return <span className="text-text-secondary">{row.kind === 'unchanged' ? 'No change' : '—'}</span>
  }
  const collapsible = row.kind === 'new'
  return (
    <div className="flex flex-col gap-xs">
      {collapsible && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="self-start text-caption font-medium text-primary hover:underline"
        >
          {open ? 'Hide' : 'Show'} {countOf(row.changes.length, false, 'filled field')}
        </button>
      )}
      {(!collapsible || open) && (
        <ul className="flex flex-col gap-xs">
          {row.changes.map((change) => (
            <ChangeLine key={change.column} change={change} kind={row.kind} />
          ))}
        </ul>
      )}
    </div>
  )
}

const rowKey = (row: Pick<CatalogImportRow, 'sheet' | 'row_number'>) => `${row.sheet}-${row.row_number}`

/** The preview, row by row: a tab per sheet, a filter per kind, one page from the server at a time. */
export function ImportRows({ item }: { item: CatalogImport }) {
  const [sheet, setSheet] = useState<CatalogImportSheet | 'all'>('all')
  const [kind, setKind] = useState<CatalogImportRowKind | null>(null)
  const paging = useCursorPagination()
  const rows = useCatalogImportRows(item.id, {
    sheet: sheet === 'all' ? undefined : sheet,
    kind: kind ?? undefined,
    cursor: paging.cursor,
    limit: ROWS_PAGE,
  })

  const summary = item.summary
  const sheets = summary?.sheets ?? []
  const counts = sheet === 'all' ? summary : sheets.find((entry) => entry.sheet === sheet)
  const count = (value: number | undefined) =>
    value == null ? undefined : <span className="text-caption text-text-secondary">{formatCount(value)}</span>

  const tabs: TabBarItem<CatalogImportSheet | 'all'>[] = [
    { key: 'all', label: 'All sheets', badge: count(summary?.rows) },
    ...sheets.map((entry) => ({ key: entry.sheet, label: SHEET_LABEL[entry.sheet], badge: count(entry.rows) })),
  ]

  const columns: TableColumn<CatalogImportRow>[] = [
    {
      key: 'row',
      header: 'Row',
      width: '7rem',
      render: (row) => (
        <div className="flex flex-col">
          <span>{formatCount(row.row_number)}</span>
          {sheet === 'all' && <span className="text-caption text-text-secondary">{SHEET_LABEL[row.sheet]}</span>}
        </div>
      ),
    },
    {
      key: 'record',
      header: 'Record',
      render: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="break-words font-medium text-text-primary">{row.label}</span>
          {row.college_name &&
            (row.college_id ? (
              <Link
                to={`/admin/colleges/${row.college_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start text-caption text-primary hover:underline"
              >
                {row.college_name}
              </Link>
            ) : (
              <span className="text-caption text-text-secondary">{row.college_name}</span>
            ))}
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Result',
      width: '7rem',
      render: (row) => <Badge color={KIND_COLOR[row.kind]}>{KIND_LABEL[row.kind]}</Badge>,
    },
    { key: 'changes', header: 'What changes', render: (row) => <RowChanges row={row} /> },
  ]

  return (
    <div className="flex flex-col gap-sm">
      <h2 className="text-h2 text-text-primary">Rows</h2>
      <TabBar
        tabs={tabs}
        active={sheet}
        ariaLabel="Sheet"
        onChange={(next) => {
          setSheet(next)
          paging.reset()
        }}
      />
      <Table
        columns={columns}
        rows={rows.data?.items ?? []}
        rowKey={rowKey}
        loading={rows.isLoading}
        error={rows.isError ? rows.error.message : undefined}
        errorSource={rows.error}
        emptyMessage="No rows here."
        quickFilters={KINDS.map((key) => (
          <FilterChip
            key={key}
            label={counts ? `${KIND_LABEL[key]} ${formatCount(counts[key])}` : KIND_LABEL[key]}
            active={kind === key}
            onChange={(active) => {
              setKind(active ? key : null)
              paging.reset()
            }}
          />
        ))}
        pagination={cursorPager(paging, rows.data?.meta)}
      />
    </div>
  )
}

function AllowedValues({ error }: { error: CatalogImportError }) {
  const [open, setOpen] = useState(false)
  const values = error.allowed_values ?? []
  if (values.length === 0) return <span className="text-text-secondary">—</span>
  const SHORT = 6
  const shown = open ? values : values.slice(0, SHORT)
  const total = error.allowed_values_total
  return (
    <div className="flex flex-col gap-0.5">
      <span className="break-words">{shown.join(', ')}</span>
      {values.length > SHORT && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="self-start text-caption font-medium text-primary hover:underline"
        >
          {open ? 'Show fewer' : `Show all ${formatCount(values.length)}`}
        </button>
      )}
      {open && typeof total === 'number' && total > values.length && (
        <span className="text-caption text-text-secondary">
          The first {formatCount(values.length)} of {formatCount(total)}.
        </span>
      )}
    </div>
  )
}

/** Every problem in the file, a page at a time, and the same list as a file. */
export function ImportErrors({ item }: { item: CatalogImport }) {
  const paging = useCursorPagination()
  const errors = useCatalogImportErrors(item.id, { cursor: paging.cursor, limit: ERRORS_PAGE })
  const download = useDownloadCatalogImportFile()
  const total = item.summary?.errors ?? 0

  const dash = <span className="text-text-secondary">—</span>
  const columns: TableColumn<CatalogImportError>[] = [
    { key: 'sheet', header: 'Sheet', render: (error) => (error.sheet ? SHEET_LABEL[error.sheet] : 'Whole file') },
    { key: 'row', header: 'Row', render: (error) => (error.row_number == null ? dash : formatCount(error.row_number)) },
    { key: 'column', header: 'Column', render: (error) => error.column ?? dash },
    {
      key: 'value',
      header: 'Value found',
      render: (error) => (error.value == null || error.value === '' ? dash : <span className="break-words">{error.value}</span>),
    },
    { key: 'message', header: 'What to fix', render: (error) => <span className="text-text-primary">{error.message}</span> },
    { key: 'allowed', header: 'Allowed values', render: (error) => <AllowedValues error={error} /> },
    {
      key: 'did_you_mean',
      header: 'Did you mean',
      render: (error) => (error.did_you_mean ? <span className="font-medium text-text-primary">{error.did_you_mean}</span> : dash),
    },
  ]

  return (
    <section aria-label="Things to fix" className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h2 className="text-h2 text-text-primary">Things to fix ({formatCount(total)})</h2>
          <p className="text-body-sm text-text-secondary">Correct these in your file, then upload it again.</p>
        </div>
        {item.has_error_file && (
          <Button
            variant="secondary"
            loading={download.isPending}
            onClick={() => download.mutate({ kind: 'errors', importId: item.id })}
          >
            <span className="inline-flex items-center gap-xs">
              <Download className="h-4 w-4" aria-hidden />
              Download the list
            </span>
          </Button>
        )}
      </div>
      {download.isError && (
        <p role="alert" className="text-body-sm text-error">
          {download.error.message}
        </p>
      )}
      <Table
        columns={columns}
        rows={errors.data?.items ?? []}
        // A page holds file-order rows; two problems may share a cell, so the position is the key.
        rowKey={(error) => `${paging.cursor ?? ''}-${(errors.data?.items ?? []).indexOf(error)}`}
        loading={errors.isLoading}
        error={errors.isError ? errors.error.message : undefined}
        errorSource={errors.error}
        emptyMessage="Nothing to fix."
        pagination={cursorPager(paging, errors.data?.meta)}
      />
    </section>
  )
}

function WarningRow({
  warning,
  checked,
  onToggle,
  disabled,
}: {
  warning: CatalogImportWarning
  checked: boolean
  onToggle: () => void
  disabled: boolean
}) {
  const inputId = useId()
  return (
    <li className="flex items-start gap-sm border-t border-border px-md py-sm first:border-t-0">
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
        aria-describedby={`${inputId}-where`}
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={inputId} className="cursor-pointer text-body-sm text-text-primary">
          {warning.message}
        </label>
        <p id={`${inputId}-where`} className="text-caption text-text-secondary">
          {SHEET_LABEL[warning.sheet]} · row {formatCount(warning.row_number)}
          {warning.column ? ` · ${warning.column}` : ''}
          {warning.value ? ` · “${warning.value}”` : ''} · already in the catalogue: “{warning.near_match.name}”
        </p>
      </div>
    </li>
  )
}

/**
 * The near matches, each with its tick box, and the Apply button under them. Apply is the
 * server's to allow (`can_apply`); here it also waits for every near match to be ticked, since
 * those ticks are what is sent.
 */
export function ImportApply({ item }: { item: CatalogImport }) {
  const expected = item.summary?.warnings ?? 0
  const warnings = useCatalogImportWarnings(item.id, expected > 0)
  const apply = useApplyCatalogImport(item.id)
  const [ticked, setTicked] = useState<Set<number>>(new Set())

  const list = warnings.data?.items ?? []
  const left = list.filter((warning) => !ticked.has(warning.id)).length
  const warningsReady = expected === 0 || (warnings.isSuccess && left === 0)

  function toggle(id: number) {
    setTicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 409: the server started nothing (the preview is out of date, another import is running…).
  const conflict = apply.isError && apply.error instanceof ApiError && apply.error.status === 409

  return (
    <div className="flex flex-col gap-lg">
      {expected > 0 && (
        <section aria-label="Near matches" className="flex flex-col gap-sm">
          <div>
            <h2 className="text-h2 text-text-primary">Check these near matches ({formatCount(expected)})</h2>
            <p className="text-body-sm text-text-secondary">
              These names are close to ones already in the catalogue. Tick each one you want added as a new record.
            </p>
          </div>
          {warnings.isLoading ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : warnings.isError ? (
            <ErrorState message={warnings.error.message} onRetry={() => void warnings.refetch()} error={warnings.error} />
          ) : (
            <div className="overflow-hidden rounded-lg bg-surface shadow-card">
              <ul className="flex max-h-96 flex-col overflow-y-auto">
                {list.map((warning) => (
                  <WarningRow
                    key={warning.id}
                    warning={warning}
                    checked={ticked.has(warning.id)}
                    onToggle={() => toggle(warning.id)}
                    disabled={apply.isPending}
                  />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {apply.isError && (
        <ServerNotice tone="error" action={conflict ? <UploadAgainLink /> : undefined}>
          {apply.error.message}
        </ServerNotice>
      )}

      <Card className="flex flex-wrap items-center justify-between gap-md">
        <div className="min-w-0">
          {!item.can_apply ? (
            <p className="text-body-sm text-text-primary">{item.apply_blocked_message}</p>
          ) : !warningsReady ? (
            <p className="text-body-sm text-text-primary">
              Tick every near match above to continue.
              {warnings.isSuccess ? ` ${formatCount(left)} left.` : ''}
            </p>
          ) : (
            <p className="text-body-sm text-text-primary">
              Ready to apply. New campuses and courses are saved as drafts. Changes to live courses show at once.
            </p>
          )}
          <p className="text-caption text-text-secondary">You can undo an import for 7 days.</p>
        </div>
        <div className="flex shrink-0 items-center gap-sm">
          {!item.can_apply && <UploadAgainLink />}
          <Button
            loading={apply.isPending}
            disabled={!item.can_apply || !warningsReady}
            onClick={() => apply.mutate(list.map((warning) => warning.id).filter((id) => ticked.has(id)))}
          >
            Apply
          </Button>
        </div>
      </Card>
    </div>
  )
}

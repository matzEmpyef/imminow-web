import { useState } from 'react'
import { Badge } from '@/components/Badge'
import { Card } from '@/components/Card'
import { FilterChip } from '@/components/FilterChip'
import { Table, type TableColumn } from '@/components/Table'
import { formatCount } from '@/lib/counts'
import { cursorPager, useCursorPagination } from '@/lib/pagination'
import {
  useCatalogImportUndoReport,
  type CatalogImport,
  type CatalogImportUndoOutcome,
  type CatalogImportUndoRecord,
} from '@/queries/catalogImports'
import { OUTCOMES, OUTCOME_COLOR, OUTCOME_LABEL, OUTCOME_NOTE } from './catalogImportWords'

const REPORT_PAGE = 50
const RECORD_TYPE: Record<CatalogImportUndoRecord['record_type'], string> = { campus: 'Campus', course: 'Course' }

/**
 * What an undo did: the four counts, then record by record, a page at a time. It opens on the
 * records that were left alone (edited by hand since the import) when there are any, since those
 * are the ones somebody may need to look at; each says why in the server's words.
 */
export function UndoReport({ item }: { item: CatalogImport }) {
  const summary = item.undo_summary
  // Until the person picks, the list starts on "Left alone" when the undo left any.
  const [picked, setPicked] = useState<CatalogImportUndoOutcome | 'all' | null>(null)
  const outcome = picked ?? (summary && summary.left_alone > 0 ? 'left_alone' : 'all')
  const paging = useCursorPagination()
  const report = useCatalogImportUndoReport(item.id, {
    outcome: outcome === 'all' ? undefined : outcome,
    cursor: paging.cursor,
    limit: REPORT_PAGE,
  })

  const columns: TableColumn<CatalogImportUndoRecord>[] = [
    {
      key: 'record',
      header: 'Record',
      render: (record) => (
        <div className="flex min-w-0 flex-col">
          <span className="break-words font-medium text-text-primary">{record.label}</span>
          <span className="text-caption text-text-secondary">
            {RECORD_TYPE[record.record_type]}
            {record.college_name ? ` · ${record.college_name}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'outcome',
      header: 'What happened',
      width: '9rem',
      render: (record) => <Badge color={OUTCOME_COLOR[record.outcome]}>{OUTCOME_LABEL[record.outcome]}</Badge>,
    },
    {
      key: 'message',
      header: 'Why',
      render: (record) => record.message ?? <span className="text-text-secondary">—</span>,
    },
  ]

  return (
    <section aria-label="Undo report" className="flex flex-col gap-md">
      <h2 className="text-h2 text-text-primary">What the undo did</h2>
      {summary && (
        <div className="grid grid-cols-2 gap-md lg:grid-cols-4">
          {OUTCOMES.map((key) => (
            <Card key={key}>
              <p className="text-caption text-text-secondary">{OUTCOME_LABEL[key]}</p>
              <p className={`mt-xs text-h1 ${key === 'left_alone' && summary[key] > 0 ? 'text-warning' : 'text-text-primary'}`}>
                {formatCount(summary[key])}
              </p>
              <p className="text-caption text-text-secondary">{OUTCOME_NOTE[key]}</p>
            </Card>
          ))}
        </div>
      )}
      <Table
        columns={columns}
        rows={report.data?.items ?? []}
        rowKey={(record) => `${paging.cursor ?? ''}-${(report.data?.items ?? []).indexOf(record)}`}
        loading={report.isLoading}
        error={report.isError ? report.error.message : undefined}
        errorSource={report.error}
        emptyMessage="No records here."
        quickFilters={OUTCOMES.map((key) => (
          <FilterChip
            key={key}
            label={summary ? `${OUTCOME_LABEL[key]} ${formatCount(summary[key])}` : OUTCOME_LABEL[key]}
            active={outcome === key}
            onChange={(active) => {
              setPicked(active ? key : 'all')
              paging.reset()
            }}
          />
        ))}
        pagination={cursorPager(paging, report.data?.meta)}
      />
    </section>
  )
}

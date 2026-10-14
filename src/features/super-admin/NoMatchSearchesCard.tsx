import { Badge } from '@/components/Badge'
import { Card } from '@/components/Card'
import { Table, type TableColumn } from '@/components/Table'
import { formatDate } from '@/lib/time'
import { humaniseCode } from '@/lib/humanise'
import type { NoMatchSearches } from '@/queries/supplyDemand'

type Row = NoMatchSearches['top'][number]

/**
 * Searches that found nothing (owner's ruling 2026-10-12, DECISIONS 120 C-19): what students looked
 * for in the course finder and did not find, as the filters they used. Shows no person, and not the
 * words typed; the server keeps neither. A signal for what the catalogue lacks.
 */
export function NoMatchSearchesCard({ block }: { block: NoMatchSearches }) {
  const columns: TableColumn<Row>[] = [
    {
      key: 'filters',
      header: 'Filters used',
      render: (r) => {
        const entries = Object.entries(r.filters)
        return (
          <div className="flex flex-wrap items-center gap-xs">
            {entries.length === 0 ? (
              <span className="text-text-secondary">No filters</span>
            ) : (
              entries.map(([name, value]) => (
                <Badge key={name} color="secondary">
                  {humaniseCode(name)}: {value}
                </Badge>
              ))
            )}
            {r.typed_words && <span className="text-caption text-text-secondary">and typed some words</span>}
          </div>
        )
      },
    },
    { key: 'searches', header: 'Searches', align: 'right', render: (r) => <span className="tabular-nums">{r.searches}</span> },
    {
      key: 'last',
      header: 'Last searched',
      render: (r) => <span className="whitespace-nowrap text-text-secondary">{formatDate(r.last_searched_at)}</span>,
    },
  ]

  return (
    <Card>
      <h2 className="text-h3 text-text-primary">Searches that found nothing</h2>
      <p className="text-caption text-text-secondary">
        {block.total === 0
          ? `No course search found nothing in the last ${block.days} days.`
          : `In the last ${block.days} days, students ran ${block.total} ${block.total === 1 ? 'course search' : 'course searches'} that found no course. The commonest filter combinations are below. This counts searches, not students.`}
      </p>
      {block.top.length > 0 && (
        <div className="mt-sm">
          <Table
            bare
            columns={columns}
            rows={block.top}
            rowKey={(r) => `${JSON.stringify(r.filters)}|${r.typed_words}`}
            emptyMessage="No searches."
          />
        </div>
      )}
    </Card>
  )
}

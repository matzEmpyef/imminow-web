import { useMemo, useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { Badge } from './Badge'
import { Table, type TableColumn } from './Table'

export interface PersonListRow {
  name: string
  email: string
  studentType: 'applicant' | 'aspirant'
  updatedAt: string
}

interface PersonListModalProps {
  title: string
  rows: PersonListRow[]
  emptyMessage: string
  onClose: () => void
  /**
   * Optional summary rendered above the list — for when the same drill-down needs to answer both
   * "who?" and a rollup of the same records ("how many per branch?", 2026-08-22). A slot rather
   * than a second popup: they are one question, and two affordances in one table cell is clutter.
   */
  intro?: ReactNode
}

type IndexedRow = PersonListRow & { index: number }

const TYPE_FILTERS = ['all', 'applicant', 'aspirant'] as const
type TypeFilter = (typeof TYPE_FILTERS)[number]
const PAGE_SIZE = 25

const typeBadgeColor: Record<'applicant' | 'aspirant', 'success' | 'info'> = {
  applicant: 'success',
  aspirant: 'info',
}

// User-requested (2026-08-15) — "we need 2 list rsvp.ed and attended. on clicking the number we
// should see the list." Shared by Webinars and Physical Meetings, the two event types that track
// RSVP and attendance as named lists (Quiz attendance is completion-based, a different shape).
// Rows reworked (user-requested, 2026-08-16) — "we don't need pill saying rsvped... instead show
// number n email and type (applicant or aspirant), maybe a filter to see only each type, update
// time." The old per-row "rsvpd" status pill is gone (redundant once you're already looking at
// the RSVP'd list specifically); each row now shows its position, email, a derived
// applicant/aspirant type badge, and the recorded time, with a type filter above the list.
// Search + pagination added same day, second follow-up — "assume there could be hundreds of rsvp
// and attendance." Rebuilt on the shared Table primitive (2026-08-17, "show # and name (details)
// - left aligned") instead of hand-rolled div rows — # and Name are real left-aligned columns now
// (Table's default alignment), same shape as the Quiz Leaderboard popup built the same day.
// `bare` drops Table's own card chrome since it's already nested inside Modal's.
export function PersonListModal({ title, rows, emptyMessage, onClose, intro }: PersonListModalProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    let items = typeFilter === 'all' ? rows : rows.filter((r) => r.studentType === typeFilter)
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
    }
    return items
  }, [rows, typeFilter, search])

  const pageRows: IndexedRow[] = filtered
    .slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
    .map((row, i) => ({ ...row, index: page * PAGE_SIZE + i + 1 }))

  const columns: TableColumn<IndexedRow>[] = [
    { key: 'index', header: '#', render: (r) => r.index },
    { key: 'name', header: 'Name', render: (r) => r.name },
    { key: 'email', header: 'Email', render: (r) => r.email },
    {
      key: 'studentType',
      header: 'Type',
      render: (r) => (
        <Badge color={typeBadgeColor[r.studentType]} className="capitalize">
          {r.studentType}
        </Badge>
      ),
    },
    { key: 'updatedAt', header: 'Updated', render: (r) => r.updatedAt },
  ]

  return (
    <Modal onClose={onClose} title={title} widthRem={40}>
      {intro && <div className="mb-md">{intro}</div>}
      <Table
        bare
        columns={columns}
        rows={pageRows}
        rowKey={(r) => `${r.index}-${r.email}`}
        emptyMessage={rows.length === 0 ? emptyMessage : 'No matches.'}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value)
            setPage(0)
          },
          placeholder: 'Search name or email…',
        }}
        filters={
          <div className="flex gap-xs">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setTypeFilter(f)
                  setPage(0)
                }}
                className={`rounded-full px-md py-[3px] text-caption font-medium capitalize transition-colors ${
                  typeFilter === f ? 'bg-pill-selected text-white' : 'bg-background text-text-secondary hover:bg-border'
                }`}
              >
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
        }
        pagination={{
          hasNext: (page + 1) * PAGE_SIZE < filtered.length,
          hasPrevious: page > 0,
          onNext: () => setPage((p) => p + 1),
          onPrevious: () => setPage((p) => Math.max(0, p - 1)),
          total: filtered.length,
        }}
      />
    </Modal>
  )
}

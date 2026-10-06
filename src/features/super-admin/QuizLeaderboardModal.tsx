// Split out of QuizAdminPage.tsx (Phase 3 plan, Tier B3, 2026-09-03) — pure movement unless noted.
import { useMemo, useState } from 'react'
import { Download, Trophy } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import { useQuizLeaderboard } from '@/queries/eventsAdmin'
import { formatDateTime, formatDuration } from '@/lib/time'
import { toCsv, downloadCsv, type CsvColumn } from '@/lib/csv'
import { type Event, type QuizLeaderboardEntry } from './quizShared'

// Same column style as the Webinar/Physical Meeting registrants export (EventAttendanceCell.tsx)
// and the Audit Log — one shared toCsv/downloadCsv (lib/csv.ts, 2026-09-12 "New exports" pass).
const LEADERBOARD_CSV_COLUMNS: CsvColumn<QuizLeaderboardEntry>[] = [
  { header: 'Rank', value: (r) => r.rank },
  { header: 'Name', value: (r) => r.student_name },
  { header: 'Email', value: (r) => r.email ?? '' },
  { header: 'Phone', value: (r) => r.phone ?? '' },
  { header: 'Score', value: (r) => r.score },
  { header: 'Time', value: (r) => formatDuration(r.completion_time_ms) },
  { header: 'Submitted', value: (r) => formatDateTime(r.submitted_at) },
]

/** What a final position won, as one line: the prize, the bonus points, or both. */
function prizeText(prize: QuizLeaderboardEntry['prize']): string {
  if (!prize) return ''
  const points = prize.points ? `${prize.points.toLocaleString('en-IN')} bonus point${prize.points === 1 ? '' : 's'}` : ''
  return [prize.prize?.trim(), points].filter(Boolean).join(' + ')
}

// Added to the export only once the results are final: before that every prize is empty, and a
// column of blanks beside a rank would read as "nobody won".
const PRIZE_CSV_COLUMN: CsvColumn<QuizLeaderboardEntry> = { header: 'Prize', value: (r) => prizeText(r.prize) }

const typeBadgeColor: Record<'applicant' | 'aspirant', 'success' | 'info'> = {
  applicant: 'success',
  aspirant: 'info',
}

const LEADERBOARD_PAGE_SIZE = 25

// User-requested (2026-08-17) — "where do I see how many people participated and their details
// as well as leader board" had no answer anywhere in the admin console before this. Built on the
// shared Table primitive (search/sort/pagination for free) rather than a bespoke list, same
// scale reasoning as PersonListModal's search+pagination follow-up — a popular quiz could have
// hundreds of attempts. `bare` (same-day follow-up — "do not put it inside card") drops Table's
// own card chrome since it's already nested inside Modal's; Contact number (same follow-up —
// "can we have contact number also") is included in the search filter alongside name/email.
export function QuizLeaderboardModal({ event, onClose }: { event: Event; onClose: () => void }) {
  const leaderboard = useQuizLeaderboard(event.id)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>({
    field: 'rank',
    direction: 'asc',
  })
  const [page, setPage] = useState(0)

  const rows = useMemo(() => {
    let items = leaderboard.data?.entries ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (r) =>
          r.student_name.toLowerCase().includes(q) ||
          (r.email ?? '').toLowerCase().includes(q) ||
          (r.phone ?? '').includes(q),
      )
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av =
          sort.field === 'score' ? a.score : sort.field === 'completion_time_ms' ? a.completion_time_ms : a.rank
        const bv =
          sort.field === 'score' ? b.score : sort.field === 'completion_time_ms' ? b.completion_time_ms : b.rank
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [leaderboard.data, search, sort])

  // PROVISIONAL OR FINAL (owner, 2026-10-06) is the server's word, never the clock's: settlement
  // runs about a minute after `results_final_at`. Until it says final, the standings are live —
  // ranks can still move and NOBODY has won, so no prize is shown on any row, not even rank 1.
  const data = leaderboard.data
  const isFinal = data?.results_final === true
  const finalAt = data?.results_final_at ?? event.results_final_at ?? null
  const lateCount = data?.late_count ?? 0

  const pageRows = rows.slice(page * LEADERBOARD_PAGE_SIZE, page * LEADERBOARD_PAGE_SIZE + LEADERBOARD_PAGE_SIZE)

  const columns: TableColumn<QuizLeaderboardEntry>[] = [
    { key: 'rank', header: '#', sortable: true, align: 'right', render: (r) => r.rank },
    { key: 'student_name', header: 'Name', sortable: true, render: (r) => r.student_name },
    // email/phone/student_type became Platform-Admin-only in the API on 2026-08-18 (the student
    // app hits this same endpoint and was receiving every classmate's contact details). This
    // console is admin-only so they are always populated here, but they are optional in the
    // contract now and `strictNullChecks` is off in this project — so guard rather than trust.
    { key: 'email', header: 'Email', render: (r) => r.email ?? '—' },
    { key: 'phone', header: 'Contact number', render: (r) => r.phone ?? '—' },
    {
      key: 'student_type',
      header: 'Type',
      render: (r) =>
        r.student_type ? (
          <Badge color={typeBadgeColor[r.student_type]} className="capitalize">
            {r.student_type}
          </Badge>
        ) : (
          '—'
        ),
    },
    {
      key: 'score',
      header: 'Score',
      sortable: true,
      align: 'right',
      render: (r) => `${r.score} / ${event.questions_per_attempt}`,
    },
    {
      key: 'completion_time_ms',
      header: 'Time',
      sortable: true,
      align: 'right',
      render: (r) => formatDuration(r.completion_time_ms),
    },
    ...(isFinal
      ? [
          {
            key: 'prize',
            header: 'Prize',
            render: (r: QuizLeaderboardEntry) =>
              r.prize && prizeText(r.prize) ? (
                <span className="inline-flex items-center gap-xs font-medium text-text-primary">
                  <Trophy className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                  {prizeText(r.prize)}
                </span>
              ) : (
                <span className="text-text-secondary">—</span>
              ),
          } satisfies TableColumn<QuizLeaderboardEntry>,
        ]
      : []),
  ]

  const allEntries = leaderboard.data?.entries ?? []

  return (
    <Modal
      onClose={onClose}
      title={`${event.title} — Leaderboard`}
      header={
        <div className="flex w-full items-center justify-between gap-md">
          <span className="font-medium text-text-primary">{event.title} — Leaderboard</span>
          <Button
            variant="secondary"
            size="sm"
            disabled={allEntries.length === 0}
            onClick={() =>
              downloadCsv(
                `${event.title.replace(/[^\w\- ]+/g, '')}-leaderboard.csv`,
                toCsv(allEntries, isFinal ? [...LEADERBOARD_CSV_COLUMNS, PRIZE_CSV_COLUMN] : LEADERBOARD_CSV_COLUMNS),
              )
            }
          >
            <span className="flex items-center gap-xs">
              <Download className="h-4 w-4" />
              Download CSV
            </span>
          </Button>
        </div>
      }
      widthRem={54}
      dismissible
    >
      {data && (
        <div className="mb-md flex flex-col gap-xs rounded-md bg-background px-md py-sm">
          <div className="flex flex-wrap items-center gap-sm">
            <Badge color={isFinal ? 'success' : 'info'}>{isFinal ? 'Final results' : 'Live standings'}</Badge>
            <p role="status" className="text-body-sm text-text-primary">
              {isFinal
                ? 'These positions are final. Winners are marked in the Prize column.'
                : finalAt
                  ? `More results may still come in. Final results at ${formatDateTime(finalAt)}.`
                  : event.status === 'voided'
                    ? 'This quiz was voided, so it has no final results.'
                    : 'More results may still come in. This quiz has no end time, so its results are never final.'}
            </p>
          </div>
          <p className="text-caption text-text-secondary">
            {data.participant_count} participated
            {lateCount > 0 && ` · ${lateCount} arrived late (not ranked)`}
            {!isFinal && ' · No one has won a prize yet'}
          </p>
        </div>
      )}
      <Table
        bare
        columns={columns}
        rows={pageRows}
        rowKey={(r) => `${r.rank}-${r.student_name}`}
        loading={leaderboard.isLoading}
        error={leaderboard.isError ? 'Could not load the leaderboard.' : undefined} errorSource={leaderboard.error}
        emptyMessage="No completed attempts yet."
        sort={sort}
        onSortChange={(field, direction) => {
          setSort({ field, direction })
          setPage(0)
        }}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value)
            setPage(0)
          },
          placeholder: 'Search name or email…',
        }}
        pagination={{
          hasNext: (page + 1) * LEADERBOARD_PAGE_SIZE < rows.length,
          hasPrevious: page > 0,
          onNext: () => setPage((p) => p + 1),
          onPrevious: () => setPage((p) => Math.max(0, p - 1)),
          total: rows.length,
        }}
      />
    </Modal>
  )
}

// Row-level component so the click-to-open state lives at its own render top level, same reasoning
// as VoidQuizAction above. The count itself is a link-styled button, not a Table cell rendering a
// plain number — clicking it opens QuizLeaderboardModal.
export function QuizParticipationCell({ event }: { event: Event }) {
  const [showLeaderboard, setShowLeaderboard] = useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowLeaderboard(true)}
        className="inline-flex items-center gap-xs text-body-sm text-primary hover:underline"
      >
        <Trophy className="h-4 w-4" />
        {event.attendance_count ?? 0} participated
      </button>
      {/* When the standings stop moving (lane v). From the server, never worked out here. */}
      {event.results_final ? (
        <p className="text-caption text-text-secondary">Final results</p>
      ) : event.results_final_at ? (
        <p className="text-caption text-text-secondary">Final results at {formatDateTime(event.results_final_at)}</p>
      ) : null}
      {showLeaderboard && <QuizLeaderboardModal event={event} onClose={() => setShowLeaderboard(false)} />}
    </div>
  )
}

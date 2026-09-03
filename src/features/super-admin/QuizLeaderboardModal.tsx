// Split out of QuizAdminPage.tsx (Phase 3 plan, Tier B3, 2026-09-03) — pure movement unless noted.
import { useMemo, useState } from 'react'
import { Trophy } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import { useQuizLeaderboard } from '@/queries/eventsAdmin'
import { formatDuration } from '@/lib/time'
import { type Event, type QuizLeaderboardEntry } from './quizShared'

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
  ]

  return (
    <Modal onClose={onClose} title={`${event.title} — Leaderboard`} widthRem={54}>
      <Table
        bare
        columns={columns}
        rows={pageRows}
        rowKey={(r) => `${r.rank}-${r.student_name}`}
        loading={leaderboard.isLoading}
        error={leaderboard.isError ? 'Could not load the leaderboard.' : undefined}
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
      {showLeaderboard && <QuizLeaderboardModal event={event} onClose={() => setShowLeaderboard(false)} />}
    </div>
  )
}

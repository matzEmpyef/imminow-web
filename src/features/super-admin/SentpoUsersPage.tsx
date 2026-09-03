import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Table, type TableColumn } from '@/components/Table'
import { CompactSelect } from '@/components/CompactSelect'
import { useSentpoUserDirectory } from '@/queries/adminUserDirectories'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate, formatDateTime } from '@/lib/time'

type Row = NonNullable<ReturnType<typeof useSentpoUserDirectory>['data']>['items'][number]

// 2 weeks / 1 month / 3 months (user, 2026-09-03) — was 7/30/90 days. The same three presets the
// Broadcast targeting form offers, so a list here and an audience there mean the same people.
const DORMANT_DAYS_OPTIONS = [
  { value: '', label: 'Any activity' },
  { value: '14', label: 'No login in 2+ weeks' },
  { value: '30', label: 'No login in 1+ month' },
  { value: '90', label: 'No login in 3+ months' },
]

// "Joined in the last…" (user, 2026-09-03). Presets resolve to a signed-up-from date on the way
// to the server (which only knows from/to); "Custom" reveals the two date inputs.
const JOINED_OPTIONS = [
  { value: '', label: 'Joined any time' },
  { value: '14', label: 'Joined in last 2 weeks' },
  { value: '30', label: 'Joined in last month' },
  { value: '90', label: 'Joined in last 3 months' },
  { value: 'custom', label: 'Joined between dates…' },
]

function daysAgoIsoDate(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// Subtle warning, not red alarm (task spec) — the same soft-tinted Badge every other status pill
// on this platform uses, just the `warning` color rather than `error`.
// `dormantAfterDays` follows the page's active filter (N9, second-pass review): with "7+ days"
// selected, a hardcoded 30 left 10-day-idle rows unbadged next to badged 31-day ones, so the
// badge contradicted the very filter that produced the list. 30 stays the default when the
// filter is "Any activity".
function LastLoginCell({ row, dormantAfterDays }: { row: Row; dormantAfterDays: number }) {
  if (!row.last_login_at) {
    return (
      <span className="flex items-center gap-xs">
        <span className="text-text-secondary">Never</span>
        <Badge color="warning">Never logged in</Badge>
      </span>
    )
  }
  const daysSince = (Date.now() - new Date(row.last_login_at).getTime()) / (1000 * 60 * 60 * 24)
  return (
    <span className="flex items-center gap-xs">
      <span className="text-text-primary">{formatDateTime(row.last_login_at)}</span>
      {daysSince > dormantAfterDays && <Badge color="warning">Dormant</Badge>}
    </span>
  )
}

const STAGE_LABELS: Record<number, string> = { 1: 'Stage 1 · Exploring', 2: 'Stage 2 · Committed' }

const PLATFORM_LABELS: Record<string, string> = { android: 'Android', ios: 'iOS', web: 'Web' }
const PLATFORM_OPTIONS = [
  { value: '', label: 'Any platform' },
  { value: 'android', label: 'Android' },
  { value: 'ios', label: 'iOS' },
  { value: 'web', label: 'Web' },
  { value: 'unknown', label: 'Not reported yet' },
]

// Where each student is in onboarding (2026-09-02, user: "list of Sentpo users who were stuck at
// onboarding.. so that we can help them"). Server-derived from the app's own preferences-pending
// rule, so this column and the app's onboarding prompt always agree.
type OnboardingState = Row['onboarding']
const ONBOARDING_OPTIONS: { value: '' | 'pending' | OnboardingState; label: string }[] = [
  { value: '', label: 'Any onboarding' },
  { value: 'pending', label: 'Not onboarded (any)' },
  { value: 'stuck', label: 'Stuck at onboarding' },
  { value: 'never_logged_in', label: 'Never came back' },
  { value: 'onboarded', label: 'Onboarded' },
]

function OnboardingCell({ state }: { state: OnboardingState }) {
  switch (state) {
    case 'onboarded':
      return <Badge color="success">Onboarded</Badge>
    case 'stuck':
      return <Badge color="error">Stuck at onboarding</Badge>
    case 'never_logged_in':
      return <Badge color="warning">Never came back</Badge>
    default:
      return <span className="text-text-secondary">—</span>
  }
}

// This is the SENTPO (student) directory — one row per student, never blended with the immiNow
// console directory (ImminowUsersPage.tsx / GET /admin/users/imminow). See docs/PROGRESS.md §4
// Step 3: "two screens, never one; the two populations must not blend."
export function SentpoUsersPage() {
  // `?onboarding=pending` is how the dashboard's Stuck at Onboarding card lands here already
  // filtered to the students who need a hand.
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<'' | '1' | '2'>('')
  const [onboarding, setOnboarding] = useState(searchParams.get('onboarding') ?? '')
  const [dormantDays, setDormantDays] = useState('')
  const [platform, setPlatform] = useState('')
  const [joined, setJoined] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const paging = useCursorPagination()

  function resetPaging() {
    paging.reset()
  }

  const directory = useSentpoUserDirectory({
    search: search || undefined,
    stage: stage ? (Number(stage) as 1 | 2) : undefined,
    onboarding: onboarding || undefined,
    dormant_days: dormantDays ? Number(dormantDays) : undefined,
    platform: platform || undefined,
    // A preset becomes a signed-up-from date; only "Custom" sends what the date inputs hold.
    from: joined && joined !== 'custom' ? daysAgoIsoDate(Number(joined)) : joined === 'custom' && from ? from : undefined,
    to: joined === 'custom' && to ? to : undefined,
    sort: sort ? (sort.direction === 'desc' ? `-${sort.field}` : sort.field) : undefined,
    cursor: paging.cursor,
    limit: 20,
  })

  const columns: TableColumn<Row>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (r) => (
        <div>
          <p className="font-medium text-text-primary">{r.name}</p>
          <p className="text-caption text-text-secondary">{r.email}</p>
        </div>
      ),
    },
    { key: 'created_at', header: 'Signed up', sortable: true, render: (r) => formatDate(r.created_at) },
    {
      key: 'last_login_at',
      header: 'Last login',
      sortable: true,
      render: (r) => <LastLoginCell row={r} dormantAfterDays={dormantDays ? Number(dormantDays) : 30} />,
    },
    { key: 'onboarding', header: 'Onboarding', render: (r) => <OnboardingCell state={r.onboarding} /> },
    {
      // The app the student last opened (2026-09-03, user: "if it is Android or iOS") — reported
      // silently by the app at session start, so it is empty until they open a build that sends it.
      key: 'platform',
      header: 'Platform',
      render: (r) =>
        r.platform ? (
          <div>
            <p className="text-text-primary">{PLATFORM_LABELS[r.platform] ?? r.platform}</p>
            {r.app_version && <p className="text-caption text-text-secondary">{r.app_version}</p>}
          </div>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    {
      key: 'journey_stage',
      header: 'Journey',
      render: (r) => (
        <div>
          <p className="text-text-primary">{STAGE_LABELS[r.journey_stage] ?? r.journey_stage}</p>
          <p className="text-caption capitalize text-text-secondary">{r.journey_status.replace(/_/g, ' ')}</p>
        </div>
      ),
    },
    {
      key: 'consultancy_name',
      header: 'Consultancy',
      render: (r) => (r.consultancy_name ? r.consultancy_name : <span className="text-text-secondary">—</span>),
    },
    { key: 'points_balance', header: 'Points', align: 'right', sortable: true, render: (r) => r.points_balance },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Sentpo Users</h1>
          <p className="text-body-sm text-text-secondary">
            Every student account — signup, activity and journey stage. Gated to Platform Staff Administration.
          </p>
        </div>

        <Table
          columns={columns}
          rows={directory.data?.items ?? []}
          rowKey={(r) => r.id}
          loading={directory.isLoading}
          error={directory.isError ? 'Could not load the Sentpo user directory.' : undefined}
          emptyMessage={
            search || stage || onboarding || dormantDays || platform || joined
              ? 'No students match these filters.'
              : 'No students have signed up yet. Every Sentpo app account appears here.'
          }
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
            placeholder: 'Search by name or email…',
          }}
          filters={
            <>
              <CompactSelect
                value={stage}
                onChange={(e) => {
                  setStage(e.target.value as '' | '1' | '2')
                  resetPaging()
                }}
                label="Journey stage"
              >
                <option value="">Any stage</option>
                <option value="1">Stage 1 · Exploring</option>
                <option value="2">Stage 2 · Committed</option>
              </CompactSelect>
              <CompactSelect
                value={onboarding}
                onChange={(e) => {
                  setOnboarding(e.target.value)
                  resetPaging()
                }}
                label="Onboarding"
              >
                {ONBOARDING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </CompactSelect>
              <CompactSelect
                value={platform}
                onChange={(e) => {
                  setPlatform(e.target.value)
                  resetPaging()
                }}
                label="Platform"
              >
                {PLATFORM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </CompactSelect>
              <CompactSelect
                value={dormantDays}
                onChange={(e) => {
                  setDormantDays(e.target.value)
                  resetPaging()
                }}
                label="Dormant"
              >
                {DORMANT_DAYS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </CompactSelect>
              <CompactSelect
                value={joined}
                onChange={(e) => {
                  setJoined(e.target.value)
                  resetPaging()
                }}
                label="Joined"
              >
                {JOINED_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </CompactSelect>
              {joined === 'custom' && (
                <>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value)
                      resetPaging()
                    }}
                    aria-label="Signed up from"
                    className="h-10 rounded-md border border-border bg-background px-3 text-body-sm"
                  />
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value)
                      resetPaging()
                    }}
                    aria-label="Signed up to"
                    className="h-10 rounded-md border border-border bg-background px-3 text-body-sm"
                  />
                </>
              )}
            </>
          }
          pagination={{
            hasNext: Boolean(directory.data?.meta.next_cursor),
            hasPrevious: paging.hasPrevious,
            onNext: () => directory.data?.meta.next_cursor && paging.next(directory.data.meta.next_cursor),
            onPrevious: paging.previous,
            total: directory.data?.meta.total,
          }}
        />
      </div>
    </AdminShell>
  )
}

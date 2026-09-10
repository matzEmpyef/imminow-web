import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, Cell, Legend, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { AdminShell } from '@/features/auth/AdminShell'
import { Card } from '@/components/Card'
import { Table, type TableColumn } from '@/components/Table'
import { DoughnutChart } from '@/components/DoughnutChart'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { usePlatformPulse, type PlatformPulseWindow } from '@/queries/platformPulse'
import { formatDate } from '@/lib/time'
import { SIGN_IN_METHOD_LABELS as METHOD_LABELS, SIGN_IN_OUTCOME_LABELS as OUTCOME_LABELS } from '@/lib/signIns'

type PulseData = NonNullable<ReturnType<typeof usePlatformPulse>['data']>
type CourseRow = PulseData['top_courses'][number]
type CollegeRow = PulseData['top_colleges'][number]
type ArticleRow = PulseData['top_articles'][number]
type ConsultancyRow = PulseData['top_consultancies'][number]
type SearchCountryRow = PulseData['top_search_countries'][number]
type SearchFieldRow = PulseData['top_search_fields'][number]
type CountryRow = PulseData['student_countries'][number]
type SignIns = PulseData['sign_ins']
type MethodRow = SignIns['by_method'][number]
type OutcomeRow = SignIns['failures_by_outcome'][number]

// Who the students are (2026-09-03, user: "if it is Android or iOS" / "country of different
// users… country of residence"). Both over the students who USED the app inside the window
// (last active, 2026-09-10 — sign-ins are rare for anyone who stays signed in), so the cards
// follow the same 7/30/90 switch as everything else here.
const PLATFORM_LABELS: Record<string, string> = { android: 'Android', ios: 'iOS', web: 'Web', unknown: 'Not reported yet' }

const countryColumns: TableColumn<CountryRow>[] = [
  { key: 'country', header: 'Country of residence', render: (r) => r.country },
  { key: 'count', header: 'Students', align: 'right', render: (r) => r.count },
]

// Sign-in health (user, 2026-09-10: "add login events"). Method/outcome wording is shared with
// the Sign-in history drawer (lib/signIns.ts).
const PRODUCT_LABELS: Record<string, string> = {
  sentpo: 'Sentpo app',
  imminow: 'immiNow console',
  unknown: 'No matching account',
}
const methodColumns: TableColumn<MethodRow>[] = [
  { key: 'method', header: 'Method', render: (r) => METHOD_LABELS[r.method] ?? r.method },
  { key: 'attempts', header: 'Attempts', align: 'right', render: (r) => r.attempts },
  {
    key: 'successes',
    header: 'Succeeded',
    align: 'right',
    render: (r) => `${Math.round((r.successes / r.attempts) * 100)}%`,
  },
]

const outcomeColumns: TableColumn<OutcomeRow>[] = [
  { key: 'outcome', header: 'Reason', render: (r) => OUTCOME_LABELS[r.outcome] ?? r.outcome },
  { key: 'count', header: 'Attempts', align: 'right', render: (r) => r.count },
]

const WINDOWS: PlatformPulseWindow[] = [7, 30, 90]

// Never a fabricated zero — every empty list on this page says exactly this instead of an empty
// table, so a thin sample is never mistaken for "nothing is happening" (task's own instruction).
function sparseMessage(collectingSince: string) {
  return `Collecting since ${formatDate(collectingSince)} — check back as usage accrues.`
}

function shortDay(isoDate: string) {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(`${isoDate}T00:00:00`))
}

function SectionChartCard({
  title,
  caption,
  sections,
  collectingSince,
}: {
  title: string
  caption: string
  sections: { module: string; views: number }[]
  collectingSince: string
}) {
  return (
    <Card>
      <h2 className="text-h3 text-text-primary">{title}</h2>
      <p className="text-caption text-text-secondary">{caption}</p>
      <div className="mt-sm">
        {sections.length === 0 ? (
          <p className="text-body-sm text-text-secondary">{sparseMessage(collectingSince)}</p>
        ) : (
          <DoughnutChart data={sections.map((s) => ({ label: s.module, value: s.views }))} />
        )}
      </div>
    </Card>
  )
}

function Figure({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex flex-col gap-xs">
      <span className="text-caption text-text-secondary">{label}</span>
      <span className="text-h3 font-semibold tabular-nums text-text-primary">{value}</span>
      {hint && <span className="text-caption text-text-secondary">{hint}</span>}
    </div>
  )
}

function SignInsCard({ signIns, sparse }: { signIns: SignIns; sparse: string }) {
  const failures = signIns.attempts - signIns.successes
  const spikes = signIns.daily.filter((d) => d.spike)
  const chartData = signIns.daily.map((d) => ({ ...d, day: shortDay(d.date) }))

  return (
    <Card>
      <h2 className="text-h3 text-text-primary">Sign-ins</h2>
      <p className="text-caption text-text-secondary">
        Every sign-in attempt with a password or a one-time code, successful or not. Reopening the app on a saved session is
        not a sign-in — that shows as activity, not here.
      </p>
      {signIns.attempts === 0 ? (
        <p className="mt-sm text-body-sm text-text-secondary">{sparse}</p>
      ) : (
        <div className="mt-md flex flex-col gap-lg">
          <div className="grid grid-cols-2 gap-md md:grid-cols-4">
            <Figure label="Attempts" value={signIns.attempts} />
            <Figure label="Success rate" value={signIns.success_rate == null ? '—' : `${signIns.success_rate}%`} />
            <Figure label="Failed attempts" value={failures} />
            <Figure
              label="Came back after a break"
              value={signIns.returning_after_gap}
              hint={`Signed in after ${signIns.returning_gap_days}+ days away`}
            />
          </div>

          <div className="flex flex-col gap-xs">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barCategoryGap="20%">
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={16}
                  tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: 'var(--color-background)' }}
                  contentStyle={{
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    fontSize: 13,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="successes" name="Succeeded" stackId="s" fill="var(--color-secondary)" isAnimationActive={false} />
                <Bar dataKey="failures" name="Failed" stackId="s" fill="var(--color-warning)" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {chartData.map((d) => (
                    <Cell key={d.date} fill={d.spike ? 'var(--color-error)' : 'var(--color-warning)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {spikes.length > 0 ? (
              <p className="text-body-sm text-error">
                Unusual number of failed sign-ins on{' '}
                {spikes.map((d) => `${shortDay(d.date)} (${d.failures} failed)`).join(', ')} — shown in red. Check Why
                sign-ins failed below: many "No account with that address" failures can mean someone is guessing passwords.
              </p>
            ) : (
              <p className="text-caption text-text-secondary">No unusual days of failed sign-ins in this window.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
            <div className="flex flex-col gap-xs">
              <h3 className="text-body-sm font-semibold text-text-primary">By method</h3>
              <Table bare columns={methodColumns} rows={signIns.by_method} rowKey={(r) => r.method} emptyMessage={sparse} />
              <p className="text-caption text-text-secondary">
                {signIns.by_product
                  .map((p) => `${PRODUCT_LABELS[p.product] ?? p.product}: ${p.attempts}`)
                  .join(' · ')}
              </p>
            </div>
            <div className="flex flex-col gap-xs">
              <h3 className="text-body-sm font-semibold text-text-primary">Why sign-ins failed</h3>
              <Table
                bare
                columns={outcomeColumns}
                rows={signIns.failures_by_outcome}
                rowKey={(r) => r.outcome}
                emptyMessage="No failed sign-ins in this window."
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

export function PlatformPulsePage() {
  const [windowDays, setWindowDays] = useState<PlatformPulseWindow>(30)
  const pulse = usePlatformPulse(windowDays)

  if (pulse.isLoading) {
    return (
      <AdminShell>
        <Skeleton className="h-64 rounded-lg" />
      </AdminShell>
    )
  }

  if (pulse.isError || !pulse.data) {
    return (
      <AdminShell>
        <ErrorState message="Could not load Platform Pulse data." onRetry={() => pulse.refetch()} />
      </AdminShell>
    )
  }

  const data = pulse.data
  const sparse = sparseMessage(data.collecting_since)

  const courseColumns: TableColumn<CourseRow>[] = [
    {
      key: 'name',
      header: 'Course',
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          {r.college_id ? (
            <Link to={`/admin/colleges/${r.college_id}`} className="font-medium text-text-primary hover:text-primary hover:underline">
              {r.name}
            </Link>
          ) : (
            <span className="font-medium text-text-primary">{r.name}</span>
          )}
          <span className="text-caption text-text-secondary">{r.college_name}</span>
        </div>
      ),
    },
    { key: 'views', header: 'Views', align: 'right', render: (r) => r.views },
    { key: 'shortlists', header: 'Shortlists', align: 'right', render: (r) => r.shortlists },
  ]

  const collegeColumns: TableColumn<CollegeRow>[] = [
    {
      key: 'name',
      header: 'College',
      render: (r) => (
        <Link to={`/admin/colleges/${r.college_id}`} className="font-medium text-text-primary hover:text-primary hover:underline">
          {r.name}
        </Link>
      ),
    },
    { key: 'views', header: 'Views', align: 'right', render: (r) => r.views },
  ]

  const articleColumns: TableColumn<ArticleRow>[] = [
    // No per-article admin route exists (/admin/blog is a plain list), so — per this page's own
    // "skip links where no admin route fits" rule — the title stays plain text rather than a Link
    // that would just land on the unrelated top of the list.
    { key: 'title', header: 'Article', render: (r) => r.title },
    { key: 'opens', header: 'Opens', align: 'right', render: (r) => r.opens },
  ]

  const consultancyColumns: TableColumn<ConsultancyRow>[] = [
    {
      key: 'name',
      header: 'Consultancy',
      render: (r) => (
        <Link to="/admin/consultancies" className="font-medium text-text-primary hover:text-primary hover:underline">
          {r.name}
        </Link>
      ),
    },
    { key: 'opens', header: 'Opens', align: 'right', render: (r) => r.opens },
  ]

  const searchCountryColumns: TableColumn<SearchCountryRow>[] = [
    { key: 'country', header: 'Country', render: (r) => r.country },
    { key: 'count', header: 'Searches', align: 'right', render: (r) => r.count },
  ]

  const searchFieldColumns: TableColumn<SearchFieldRow>[] = [
    { key: 'field', header: 'Field of study', render: (r) => r.field },
    { key: 'count', header: 'Searches', align: 'right', render: (r) => r.count },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-wrap items-center justify-between gap-md">
          <div>
            <h1 className="text-h1 text-text-primary">Platform Pulse</h1>
            <p className="text-body-sm text-text-secondary">
              What's most popular across the platform — collecting since {formatDate(data.collecting_since)}.
            </p>
          </div>
          <div className="flex gap-xs rounded-full border border-border bg-surface p-xs">
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setWindowDays(w)}
                className={`rounded-full px-md py-xs text-body-sm transition-colors ${
                  windowDays === w ? 'bg-primary text-text-on-primary' : 'text-text-secondary'
                }`}
              >
                {w} days
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
          <SectionChartCard
            title="Sentpo Sections"
            caption="Most-opened areas of the student mobile app — jobs, blog, events, college search, abroad vs. local."
            sections={data.sentpo_sections}
            collectingSince={data.collecting_since}
          />
          <SectionChartCard
            title="immiNow Sections"
            caption="Most-opened areas of the console — consultancy staff, platform staff, and freelancers."
            sections={data.imminow_sections}
            collectingSince={data.collecting_since}
          />
        </div>

        <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
          <Card>
            <h2 className="text-h3 text-text-primary">Students by Platform</h2>
            <p className="text-caption text-text-secondary">
              The app each active student last opened — {data.active_students} used the app within this window. "Not reported
              yet" means the student hasn't opened a build that sends it.
            </p>
            <div className="mt-sm">
              {data.student_platforms.length === 0 ? (
                <p className="text-body-sm text-text-secondary">{sparse}</p>
              ) : (
                <DoughnutChart
                  data={data.student_platforms.map((s) => ({ label: PLATFORM_LABELS[s.platform] ?? s.platform, value: s.count }))}
                />
              )}
            </div>
          </Card>
          <Card>
            <h2 className="text-h3 text-text-primary">Students by Country</h2>
            <p className="text-caption text-text-secondary">
              Country of residence from each student's profile, for the same active students. "Unknown" = residence not set.
            </p>
            <div className="mt-sm">
              <Table bare columns={countryColumns} rows={data.student_countries} rowKey={(r) => r.country} emptyMessage={sparse} />
            </div>
          </Card>
        </div>

        <SignInsCard signIns={data.sign_ins} sparse={sparse} />

        <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
          <Card>
            <h2 className="text-h3 text-text-primary">Top Courses</h2>
            <p className="text-caption text-text-secondary">
              By view count in the window; shortlist counts reset whenever the mock server restarts (in-memory store).
            </p>
            <div className="mt-sm">
              <Table bare columns={courseColumns} rows={data.top_courses} rowKey={(r) => r.course_id} emptyMessage={sparse} />
            </div>
          </Card>
          <Card>
            <h2 className="text-h3 text-text-primary">Top Colleges</h2>
            <p className="text-caption text-text-secondary">Summed course views across every course, not just the top 5 above.</p>
            <div className="mt-sm">
              <Table bare columns={collegeColumns} rows={data.top_colleges} rowKey={(r) => r.college_id} emptyMessage={sparse} />
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
          <Card>
            <h2 className="text-h3 text-text-primary">Top Articles</h2>
            <p className="text-caption text-text-secondary">By blog article opens in the window.</p>
            <div className="mt-sm">
              <Table bare columns={articleColumns} rows={data.top_articles} rowKey={(r) => r.id} emptyMessage={sparse} />
            </div>
          </Card>
          <Card>
            <h2 className="text-h3 text-text-primary">Top Consultancies</h2>
            <p className="text-caption text-text-secondary">By consultancy profile opens in the window.</p>
            <div className="mt-sm">
              <Table bare columns={consultancyColumns} rows={data.top_consultancies} rowKey={(r) => r.id} emptyMessage={sparse} />
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
          <Card>
            <h2 className="text-h3 text-text-primary">Top Search Countries</h2>
            <p className="text-caption text-text-secondary">
              From chosen filter values on course search — sparse until the enriched capture (2026-08-31) accrues more data.
            </p>
            <div className="mt-sm">
              <Table
                bare
                columns={searchCountryColumns}
                rows={data.top_search_countries}
                rowKey={(r) => r.country}
                emptyMessage={sparse}
              />
            </div>
          </Card>
          <Card>
            <h2 className="text-h3 text-text-primary">Top Search Fields</h2>
            <p className="text-caption text-text-secondary">
              Web console searches only for now — mobile's field-of-study filter mixes free text and is excluded (recorded PII
              rule).
            </p>
            <div className="mt-sm">
              <Table bare columns={searchFieldColumns} rows={data.top_search_fields} rowKey={(r) => r.field} emptyMessage={sparse} />
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  )
}

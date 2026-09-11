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

// Readable names for the section keys the apps send (the first part of the screen's address —
// user review, 2026-09-11: the chart showed raw keys like "admin"). Keys that mean the same area
// merge into one slice; anything unrecognised is grouped as Other.
const SENTPO_SECTION_LABELS: Record<string, string> = {
  home: 'Home',
  'study-abroad': 'Study abroad',
  'study-in-country': 'Study in my country',
  events: 'Events',
  event: 'Events',
  'quiz-runner': 'Events',
  jobs: 'Jobs',
  job: 'Jobs',
  'saved-jobs': 'Jobs',
  'job-alerts': 'Jobs',
  'search-results': 'Course search',
  course: 'Courses',
  college: 'Colleges',
  shortlist: 'Dream courses',
  discovery: 'Consultancies',
  leads: 'Consultancy chats',
  chat: 'Consultancy chats',
  plan: 'My plan',
  'plan-complete': 'My plan',
  'applicant-form': 'My plan',
  'verified-review': 'Reviews',
  payments: 'Payments',
  blog: 'Blog',
  article: 'Blog',
  'saved-articles': 'Blog',
  points: 'Points & coupons',
  coupons: 'Points & coupons',
  coupon: 'Points & coupons',
  profile: 'Profile',
  notifications: 'Notifications',
  legal: 'Legal',
  splash: 'Sign-up & onboarding',
  login: 'Sign-up & onboarding',
  signup: 'Sign-up & onboarding',
  consent: 'Sign-up & onboarding',
  onboarding: 'Sign-up & onboarding',
  preferences: 'Sign-up & onboarding',
}
const IMMINOW_SECTION_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  sales: 'Leads',
  clients: 'Clients',
  activity: 'Activity',
  administration: 'Consultancy management',
  notifications: 'Notifications',
  account: 'My account',
  freelancer: 'Freelancer',
  guardian: 'Guardian consent',
  login: 'Sign-in',
  'forgot-password': 'Sign-in',
  'reset-password': 'Sign-in',
  'set-password': 'Sign-in',
}

function labelSections(sections: { module: string; views: number }[], labels: Record<string, string>) {
  const merged = new Map<string, number>()
  for (const s of sections) {
    const label = labels[s.module] ?? 'Other'
    merged.set(label, (merged.get(label) ?? 0) + s.views)
  }
  return [...merged.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => Number(a.label === 'Other') - Number(b.label === 'Other') || b.value - a.value)
}

// Never a fabricated zero — every empty card says what is and is not known (user, 2026-09-11: the
// old "Collecting since … check back as usage accrues" read vague). Follows the period at the top.
function sparseMessage(collectingSince: string, windowDays: number) {
  const since = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(collectingSince),
  )
  return `Nothing recorded in the last ${windowDays} days. Recording since ${since}.`
}

function shortDay(isoDate: string) {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(`${isoDate}T00:00:00`))
}

function SectionChartCard({
  title,
  caption,
  sections,
  labels,
  emptyMessage,
}: {
  title: string
  caption: string
  sections: { module: string; views: number }[]
  labels: Record<string, string>
  emptyMessage: string
}) {
  return (
    <Card>
      <h2 className="text-h3 text-text-primary">{title}</h2>
      <p className="text-caption text-text-secondary">{caption}</p>
      <div className="mt-sm">
        {sections.length === 0 ? (
          <p className="text-body-sm text-text-secondary">{emptyMessage}</p>
        ) : (
          <DoughnutChart data={labelSections(sections, labels)} />
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
  const sparse = sparseMessage(data.collecting_since, data.window_days)

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

        {/* Grouped under headings (user review, 2026-09-11) — it was twelve cards in one list. */}
        <h2 className="text-h3 text-text-primary">Students</h2>
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

        <h2 className="text-h3 text-text-primary">App usage</h2>
        <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
          <SectionChartCard
            title="Sentpo Sections"
            caption="The most-opened areas of the Sentpo app in this period."
            sections={data.sentpo_sections}
            labels={SENTPO_SECTION_LABELS}
            emptyMessage={sparse}
          />
          <SectionChartCard
            title="immiNow Sections"
            caption="The most-opened areas of the console by consultancy staff and freelancers. The platform team's own use is not counted."
            sections={data.imminow_sections}
            labels={IMMINOW_SECTION_LABELS}
            emptyMessage={sparse}
          />
        </div>

        <h2 className="text-h3 text-text-primary">Catalog interest</h2>
        <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
          <Card>
            <h2 className="text-h3 text-text-primary">Top Courses</h2>
            <p className="text-caption text-text-secondary">
              The most-viewed courses in this period, and how many times each was saved to a Dream Courses list.
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
              Countries students and consultancy staff filtered course searches by in this period.
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
            <h2 className="text-h3 text-text-primary">Fields Consultancies Search For</h2>
            <p className="text-caption text-text-secondary">
              Fields of study consultancy staff filtered Course Finder by. What students want is on Supply &amp; Demand.
            </p>
            <div className="mt-sm">
              <Table bare columns={searchFieldColumns} rows={data.top_search_fields} rowKey={(r) => r.field} emptyMessage={sparse} />
            </div>
          </Card>
        </div>

        {/* No group heading here: the card is already titled Sign-ins. */}
        <SignInsCard signIns={data.sign_ins} sparse={sparse} />
      </div>
    </AdminShell>
  )
}

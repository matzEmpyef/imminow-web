import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '@/features/auth/AdminShell'
import { Card } from '@/components/Card'
import { Table, type TableColumn } from '@/components/Table'
import { DoughnutChart } from '@/components/DoughnutChart'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { usePlatformPulse, type PlatformPulseWindow } from '@/queries/platformPulse'
import { formatDate } from '@/lib/time'

type PulseData = NonNullable<ReturnType<typeof usePlatformPulse>['data']>
type CourseRow = PulseData['top_courses'][number]
type CollegeRow = PulseData['top_colleges'][number]
type ArticleRow = PulseData['top_articles'][number]
type ConsultancyRow = PulseData['top_consultancies'][number]
type SearchCountryRow = PulseData['top_search_countries'][number]
type SearchFieldRow = PulseData['top_search_fields'][number]

const WINDOWS: PlatformPulseWindow[] = [7, 30, 90]

// Never a fabricated zero — every empty list on this page says exactly this instead of an empty
// table, so a thin sample is never mistaken for "nothing is happening" (task's own instruction).
function sparseMessage(collectingSince: string) {
  return `Collecting since ${formatDate(collectingSince)} — check back as usage accrues.`
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

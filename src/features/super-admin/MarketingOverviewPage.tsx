import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '@/features/auth/AdminShell'
import { Card } from '@/components/Card'
import { useMarketingOverview, type MarketingOverview } from '@/queries/marketingOverview'
import { formatDateTime } from '@/lib/time'

const EVENT_PAGES: Record<string, string> = {
  webinar: '/admin/webinars',
  physical_meeting: '/admin/physical-meetings',
  quiz: '/admin/quiz',
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  webinar: 'Webinar',
  physical_meeting: 'In-person',
  quiz: 'Quiz',
}

// What an unnamed ad is called here — the same destination words the Ads page uses.
const AD_FALLBACK_NAMES: Record<string, string> = {
  external_url: 'Link ad',
  event: 'Event ad',
  internal: 'Consultancy ad',
}

const number = (n: number) => n.toLocaleString('en-IN')

function clickThrough(clicks: number, impressions: number) {
  return impressions > 0 ? `${((clicks / impressions) * 100).toFixed(1)}% click-through` : 'No impressions yet'
}

/**
 * Marketing overview (Marketing review, 2026-09-11) — the section had nine pages and no page that
 * said how any of it was doing. Every number links to the page that owns it. Counts cover the last
 * 30 days where the record carries a date; ad clicks and impressions are the lifetime counters of
 * the ads live now, since an ad stores no daily history.
 */
export function MarketingOverviewPage() {
  const overview = useMarketingOverview()
  const data = overview.data

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-col gap-xs">
          <h1 className="text-h1 text-text-primary">Marketing overview</h1>
          <p className="text-body-sm text-text-secondary">
            How the Sentpo app&apos;s marketing is doing — the last {data?.window_days ?? 30} days unless a number says
            otherwise.
          </p>
        </div>
        {overview.isLoading ? (
          <p className="text-body-sm text-text-secondary">Loading…</p>
        ) : overview.isError || !data ? (
          <p className="text-body-sm text-error">Could not load the overview.</p>
        ) : (
          <OverviewBody data={data} />
        )}
      </div>
    </AdminShell>
  )
}

function OverviewBody({ data }: { data: MarketingOverview }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-md lg:grid-cols-4">
        <Stat
          label="Points earned"
          value={number(data.points.issued)}
          hint={data.points.reversed > 0 ? `${number(data.points.reversed)} taken back (voided quizzes)` : 'By students, all rules'}
          to="/admin/earn-rules"
        />
        <Stat
          label="Points spent"
          value={number(data.points.redeemed)}
          hint={`${data.points.coupons_claimed} coupon${data.points.coupons_claimed === 1 ? '' : 's'} claimed`}
          to="/admin/coupons"
        />
        <Stat label="Live ads" value={data.ads.live} hint={clickThrough(data.ads.clicks, data.ads.impressions)} to="/admin/ads" />
        <Stat label="Live job listings" value={data.jobs.live} hint={`${number(data.jobs.clicks)} apply clicks`} to="/admin/jobs" />
        <Stat
          label="Upcoming events"
          value={data.events.upcoming}
          hint={`${number(data.events.upcoming_rsvps)} registered`}
          to="/admin/webinars"
        />
        <Stat label="Event check-ins" value={number(data.events.attended)} hint="Webinars and in-person" to="/admin/physical-meetings" />
        <Stat label="Quiz attempts" value={number(data.events.quiz_attempts)} to="/admin/quiz" />
        <Stat
          label="First-time article reads"
          value={number(data.blog.reads)}
          hint={`${data.blog.published} articles in the app`}
          to="/admin/blog"
        />
      </div>
      <div className="grid gap-md lg:grid-cols-3">
        <ListCard title="Ads live now" to="/admin/ads" empty="No ads are live.">
          {data.ads.top.map((ad) => (
            <li key={ad.id} className="flex items-center gap-sm py-sm">
              <img src={ad.image_url} alt="" className="h-9 w-[4.5rem] shrink-0 rounded-md object-cover" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-body-sm font-medium text-text-primary">
                  {ad.name ?? AD_FALLBACK_NAMES[ad.destination_type] ?? 'Ad'}
                </span>
                <span className="text-caption tabular-nums text-text-secondary">
                  {number(ad.clicks)} clicks · {number(ad.impressions)} seen ·{' '}
                  {ad.ctr_percent == null ? 'no impressions yet' : `${ad.ctr_percent}%`}
                </span>
              </div>
            </li>
          ))}
        </ListCard>
        <ListCard title="Coming up" to="/admin/webinars" empty="Nothing scheduled.">
          {data.events.next.map((event) => (
            <li key={event.id} className="flex flex-col py-sm">
              <Link
                to={EVENT_PAGES[event.type] ?? '/admin/webinars'}
                className="truncate text-body-sm font-medium text-text-primary hover:text-primary"
              >
                {event.title}
              </Link>
              <span className="text-caption tabular-nums text-text-secondary">
                {EVENT_TYPE_LABELS[event.type] ?? event.type} · {formatDateTime(event.starts_at)} · {event.rsvp_count}
                {event.capacity != null ? ` / ${event.capacity}` : ''} registered
              </span>
            </li>
          ))}
        </ListCard>
        <ListCard title="Most-clicked jobs" to="/admin/jobs" empty="No apply clicks in this period.">
          {data.jobs.top.map((job) => (
            <li key={job.id} className="flex items-center justify-between gap-sm py-sm">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-body-sm font-medium text-text-primary">{job.title}</span>
                <span className="truncate text-caption text-text-secondary">{job.company}</span>
              </div>
              <span className="shrink-0 text-body-sm tabular-nums text-text-primary">{number(job.clicks)}</span>
            </li>
          ))}
        </ListCard>
      </div>
    </>
  )
}

function Stat({ label, value, hint, to }: { label: string; value: ReactNode; hint?: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col gap-xs rounded-lg bg-surface p-md shadow-card transition-colors hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span className="text-caption font-medium uppercase tracking-wide text-text-secondary">{label}</span>
      <span className="text-h2 tabular-nums text-text-primary">{value}</span>
      {hint && <span className="text-caption text-text-secondary">{hint}</span>}
    </Link>
  )
}

function ListCard({ title, to, empty, children }: { title: string; to: string; empty: string; children: ReactNode[] }) {
  return (
    <Card>
      <div className="flex flex-col gap-sm">
        <div className="flex items-baseline justify-between gap-sm">
          <h2 className="text-body font-medium text-text-primary">{title}</h2>
          <Link to={to} className="text-body-sm font-medium text-primary hover:underline">
            Open
          </Link>
        </div>
        {children.length === 0 ? (
          <p className="text-body-sm text-text-secondary">{empty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">{children}</ul>
        )}
      </div>
    </Card>
  )
}

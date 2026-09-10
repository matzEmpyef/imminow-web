import { Link, useNavigate } from 'react-router-dom'
import { AdminShell } from '@/features/auth/AdminShell'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { DoughnutChart } from '@/components/DoughnutChart'
import { MonthlyBarChart } from '@/components/MonthlyBarChart'
import { useAdminDashboard } from '@/queries/adminDashboard'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { formatMoney } from '@/lib/money'

// Where each stat card's number is actually managed. Aspirants live in each consultancy's lead
// pool and demand shows on Supply & Demand; applicants and completed cases sit with their
// consultancy in Manage Consultancies; catalog counts open Colleges & Courses.
const STAT_CARD_LINKS: Record<string, string> = {
  total_consultancies: '/admin/consultancies',
  total_students: '/admin/users/sentpo',
  stuck_onboarding: '/admin/users/sentpo?onboarding=pending',
  study_abroad_students: '/admin/supply-demand',
  study_home_students: '/admin/supply-demand',
  active_aspirants: '/admin/supply-demand',
  active_applicants: '/admin/consultancies',
  completed_cases: '/admin/consultancies',
  total_colleges: '/admin/colleges',
  total_courses: '/admin/colleges',
  courses_missing_requirements: '/admin/colleges',
}

type DashboardData = NonNullable<ReturnType<typeof useAdminDashboard>['data']>
type OrgRanking = NonNullable<DashboardData['applicants_by_organisation']>['consultancies']

// Current applicants per organisation (user, 2026-09-10). A doughnut of at most 10 slices — the
// top 9 plus one Others slice for the rest — so it holds at any number of organisations; the old
// one drew a slice per organisation. Organisations at zero are only counted.
function OrgApplicantsCard({
  title,
  singular,
  plural,
  ranking,
}: {
  title: string
  singular: string
  plural: string
  ranking: OrgRanking
}) {
  const noun = (n: number) => (n === 1 ? singular : plural)
  const slices = [
    ...ranking.top.map((r) => ({ label: r.name, value: r.count })),
    ...(ranking.others.organisations > 0
      ? [{ label: `Others (${ranking.others.organisations} ${noun(ranking.others.organisations)})`, value: ranking.others.count }]
      : []),
  ]
  return (
    <Card>
      <div className="flex items-center justify-between gap-sm">
        <h2 className="text-h3 text-text-primary">{title}</h2>
        <Link to="/admin/performance-league" className="text-body-sm text-primary hover:underline">
          View all
        </Link>
      </div>
      <p className="text-caption text-text-secondary">
        {ranking.total} active applicant{ranking.total === 1 ? '' : 's'} across {ranking.organisations_with_applicants}{' '}
        {noun(ranking.organisations_with_applicants)}
      </p>
      {slices.length === 0 ? (
        <p className="mt-sm text-body-sm text-text-secondary">No {plural} have active applicants right now.</p>
      ) : (
        <div className="mt-sm">
          <DoughnutChart data={slices} />
        </div>
      )}
      {ranking.organisations_without_applicants > 0 && (
        <p className="mt-sm text-caption text-text-secondary">
          {ranking.organisations_without_applicants} more {noun(ranking.organisations_without_applicants)} with no active
          applicants.
        </p>
      )}
    </Card>
  )
}

export function SuperAdminDashboardPage() {
  const navigate = useNavigate()
  const dashboard = useAdminDashboard()

  if (dashboard.isLoading) {
    return (
      <AdminShell>
        <Skeleton className="h-64 rounded-lg" />
      </AdminShell>
    )
  }

  // H6 fix (frontend review, 1 Sep 2026) — this used to gate on isLoading only, so a failed
  // Overview fetch rendered every chart/stat card at its zero/undefined fallback, indistinguishable
  // from an operator's-eye-view of a genuinely quiet platform.
  if (dashboard.isError || !dashboard.data) {
    return (
      <AdminShell>
        <ErrorState message="Could not load the platform dashboard." onRetry={() => dashboard.refetch()} />
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        {/* "Platform", not "Super Admin" — this landing page is the one console surface every
            platform account sees, flags or not (#12); the old title lied to a Platform Staff
            viewer. */}
        <h1 className="text-h1 text-text-primary">Platform Dashboard</h1>

        <div className="grid grid-cols-2 gap-md md:grid-cols-4">
          {dashboard.data?.stat_cards.map((card) => {
            // Every card links to the page where its population is managed (user, 2026-09-02:
            // "link all the cards to some page... make sure numbers are correct"). Total
            // Consultancies had been the lone clickable card since 2026-08-19.
            const to = card.key ? STAT_CARD_LINKS[card.key] : undefined
            // Stuck at Onboarding is a to-do, not a statistic — alert treatment once there is
            // somebody to help, calm at zero.
            const alert = card.key === 'stuck_onboarding' && (card.value ?? 0) > 0
            return (
              <Card
                key={card.key}
                onClick={to ? () => navigate(to) : undefined}
                className={to ? 'cursor-pointer transition-colors hover:bg-background' : undefined}
              >
                <div className="flex items-center justify-between gap-xs">
                  <p className="text-caption text-text-secondary">{card.label}</p>
                  {alert && <Badge color="error">Needs help</Badge>}
                </div>
                <p className={`mt-xs text-h1 ${alert ? 'text-error' : 'text-text-primary'}`}>{card.value}</p>
                {card.hint && <p className="mt-xs text-caption text-text-secondary">{card.hint}</p>}
              </Card>
            )
          })}
          {/* Pending Actions, Pending Allocation and Quick Links were removed from the Overview
              (user, 2026-09-10) — those queues live on Needs attention. Revenue Snapshot, the one
              card left from that row, joins the stat grid rather than sitting alone. */}
          <Card
            onClick={() => navigate('/admin/finance-dashboard')}
            className="cursor-pointer transition-colors hover:bg-background"
          >
            <p className="text-caption text-text-secondary">Revenue Snapshot</p>
            <p className="mt-xs text-h1 text-text-primary">
              {formatMoney(dashboard.data?.revenue_snapshot?.currency, dashboard.data?.revenue_snapshot?.amount)}
            </p>
            <p className="mt-xs text-caption text-text-secondary">Confirmed platform commission received.</p>
          </Card>
        </div>

        {/* User-requested (2026-08-18) — "In Dashboard, I don't want Recent Activity... Instead,
            I would like to see some graphs.. how many new users are registering each month, how
            many users for each consultancy (doughnut), how many aspirants, how many applicant."
            Replaces the old Recent Activity card entirely. */}
        <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
          <Card>
            <h2 className="text-h3 text-text-primary">New Registrations by Month</h2>
            {/* Actual new people by acquisition channel (user, 2026-09-10) — each person counted once,
                in the month they arrived; an aspirant later becoming an applicant is not counted
                again. Replaced the aspirants/applicants series, which counted records, not people. */}
            <div className="mt-sm">
              <MonthlyBarChart
                data={dashboard.data?.registrations_over_time ?? []}
                series={[
                  { key: 'channel_a', label: 'Channel A', color: 'var(--color-secondary)' },
                  { key: 'channel_b', label: 'Channel B', color: 'var(--color-primary)' },
                  { key: 'channel_c', label: 'Channel C', color: 'var(--color-warning)' },
                ]}
              />
            </div>
            <dl className="mt-sm flex flex-col gap-xs text-caption text-text-secondary">
              <div>
                <dt className="inline font-medium text-text-primary">Channel A · Sentpo direct</dt>
                <dd className="inline"> — signed up in the Sentpo app on their own; starts as an aspirant.</dd>
              </div>
              <div>
                <dt className="inline font-medium text-text-primary">Channel B · Consultancy-sourced</dt>
                <dd className="inline"> — anyone a consultancy adds: Add Lead, Import Leads or Create Applicant.</dd>
              </div>
              <div>
                <dt className="inline font-medium text-text-primary">Channel C · Freelancer referral</dt>
                <dd className="inline"> — signed up with a freelancer's referral code.</dd>
              </div>
            </dl>
          </Card>
          <Card>
            <h2 className="text-h3 text-text-primary">Aspirants, Applicants &amp; Enrolled</h2>
            <p className="text-caption text-text-secondary">
              Open now: Stage 1 leads and Stage 2 cases. Enrolled: cases closed successfully, all time.
            </p>
            <div className="mt-sm">
              <DoughnutChart
                data={(dashboard.data?.applicant_stage_breakdown ?? []).map((d) => ({
                  label: d.label,
                  value: d.count,
                }))}
              />
            </div>
          </Card>
        </div>

        {dashboard.data.applicants_by_organisation && (
          <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
            <OrgApplicantsCard
              title="Applicants by Consultancy"
              singular="consultancy"
              plural="consultancies"
              ranking={dashboard.data.applicants_by_organisation.consultancies}
            />
            <OrgApplicantsCard
              title="Applicants by Institute"
              singular="institute"
              plural="institutes"
              ranking={dashboard.data.applicants_by_organisation.institutes}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
          <Card>
            <h2 className="text-h3 text-text-primary">Confirmed Revenue by Month</h2>
            <p className="text-caption text-text-secondary">Last 12 months, confirmed platform commission only.</p>
            <div className="mt-sm">
              <MonthlyBarChart
                data={(dashboard.data?.revenue_over_time ?? []).map((d) => ({ month: d.month, value: d.amount }))}
                valueLabel="Revenue (INR)"
                color="var(--color-success)"
              />
            </div>
          </Card>
          <Card>
            <h2 className="text-h3 text-text-primary">Completed Cases by Month</h2>
            <p className="text-caption text-text-secondary">
              Last 12 months. Grouped by when the case was created, as a stand-in for a real completion date — no seeded
              case has one recorded yet.
            </p>
            <div className="mt-sm">
              <MonthlyBarChart
                data={(dashboard.data?.completed_cases_over_time ?? []).map((d) => ({ month: d.month, value: d.count }))}
                valueLabel="Completed cases"
                color="var(--color-warning)"
              />
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  )
}

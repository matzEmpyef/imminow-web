import { useNavigate } from 'react-router-dom'
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
            <p className="text-caption text-text-secondary">
              Last 12 months — aspirants and applicants stacked, not combined.
            </p>
            <div className="mt-sm">
              <MonthlyBarChart
                data={dashboard.data?.registrations_over_time ?? []}
                series={[
                  { key: 'aspirants', label: 'Aspirants', color: 'var(--color-secondary)' },
                  { key: 'applicants', label: 'Applicants', color: 'var(--color-primary)' },
                ]}
              />
            </div>
          </Card>
          <Card>
            <h2 className="text-h3 text-text-primary">Aspirants vs Applicants</h2>
            <p className="text-caption text-text-secondary">Stage 1 (not yet with a consultancy) vs Stage 2.</p>
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

        <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
          <Card>
            <h2 className="text-h3 text-text-primary">Applicants by Consultancy</h2>
            <p className="text-caption text-text-secondary">
              Only one consultancy in this environment has real applicant data behind it — the rest show 0, not a
              fabricated figure.
            </p>
            <div className="mt-sm">
              <DoughnutChart
                data={(dashboard.data?.applicants_by_consultancy ?? []).map((d) => ({
                  label: d.consultancy_name,
                  value: d.count,
                }))}
              />
            </div>
          </Card>
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
        </div>

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
    </AdminShell>
  )
}

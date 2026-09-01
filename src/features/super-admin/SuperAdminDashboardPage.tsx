import { Link, useNavigate } from 'react-router-dom'
import { AdminShell } from '@/features/auth/AdminShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { DoughnutChart } from '@/components/DoughnutChart'
import { MonthlyBarChart } from '@/components/MonthlyBarChart'
import { useAdminDashboard } from '@/queries/adminDashboard'
import { useApplicantAllocationQueue } from '@/queries/applicantAllocation'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { formatMoney } from '@/lib/money'

export function SuperAdminDashboardPage() {
  const navigate = useNavigate()
  const dashboard = useAdminDashboard()
  const allocationQueue = useApplicantAllocationQueue()
  const pendingAllocationCount = allocationQueue.data?.length ?? 0

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
            // Total Consultancies is clickable through to Manage Consultancies (user-requested,
            // 2026-08-19) — every other stat card here is informational only, so this is a
            // special case rather than a generic "all cards are clickable" rule.
            const clickable = card.key === 'total_consultancies'
            return (
              <Card
                key={card.key}
                onClick={clickable ? () => navigate('/admin/consultancies') : undefined}
                className={clickable ? 'cursor-pointer transition-colors hover:bg-background' : undefined}
              >
                <p className="text-caption text-text-secondary">{card.label}</p>
                <p className="mt-xs text-h1 text-text-primary">{card.value}</p>
              </Card>
            )
          })}
        </div>

        <div className="grid grid-cols-1 gap-lg md:grid-cols-4">
          <Card>
            <p className="text-body-sm font-medium text-text-primary">Pending Actions</p>
            <p className="mt-xs text-h1 text-text-primary">{dashboard.data?.pending_actions_count}</p>
            <p className="text-caption text-text-secondary">Course suggestions/corrections awaiting review.</p>
            <Link to="/admin/course-suggestions-review">
              <Button variant="secondary" className="mt-md">
                Review
              </Button>
            </Link>
          </Card>

          {/* User-requested (2026-08-18) — "Applicant Allocation - show it in dashboard count
              (pending allocation) - clickable to page.. should be easily noticeable if count is
              greater than 0." Reuses the same queue GET the Applicant Allocation page itself
              already fetches (no new dashboard-stats field needed) — the count is either 0 or a
              real number of people waiting on a consultancy, no separate aggregate to keep in
              sync. `error`-colored count + a Badge, both only once there's something to notice;
              at 0 this reads as a calm, ordinary stat like every other card here. */}
          <Card
            onClick={() => navigate('/admin/applicant-allocation')}
            className="cursor-pointer transition-colors hover:bg-background"
          >
            <div className="flex items-center justify-between">
              <p className="text-body-sm font-medium text-text-primary">Pending Allocation</p>
              {pendingAllocationCount > 0 && <Badge color="error">Needs allocation</Badge>}
            </div>
            {/* N5 (second-pass review): a failed queue fetch used to render as a calm 0 — the one
                number on this card whose whole job is "is anyone stuck waiting", shown as "nobody".
                Card-scoped, so a queue hiccup doesn't take down the rest of the dashboard. */}
            {allocationQueue.isError ? (
              <p className="mt-xs text-body-sm text-error">
                Couldn't load the queue.{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={(e) => {
                    e.stopPropagation()
                    void allocationQueue.refetch()
                  }}
                >
                  Retry
                </button>
              </p>
            ) : (
              <p className={`mt-xs text-h1 ${pendingAllocationCount > 0 ? 'text-error' : 'text-text-primary'}`}>
                {allocationQueue.isLoading ? '…' : pendingAllocationCount}
              </p>
            )}
            <p className="text-caption text-text-secondary">
              Freelancer-sourced applicants, and students asking to change consultancy.
            </p>
          </Card>

          <Card>
            <p className="text-body-sm font-medium text-text-primary">Revenue Snapshot</p>
            <p className="mt-xs text-h1 text-text-primary">
              {formatMoney(dashboard.data?.revenue_snapshot?.currency, dashboard.data?.revenue_snapshot?.amount)}
            </p>
            <p className="text-caption text-text-secondary">Confirmed platform commission received.</p>
          </Card>

          <Card>
            <p className="text-body-sm font-medium text-text-primary">Quick Links</p>
            <div className="mt-sm flex flex-col gap-xs">
              <Link to="/admin/consultancies" className="text-body-sm text-primary hover:underline">
                Manage Consultancies
              </Link>
              <Link to="/admin/colleges" className="text-body-sm text-primary hover:underline">
                Colleges & Courses
              </Link>
            </div>
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

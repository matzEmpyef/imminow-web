import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { CheckCircle2, FolderKanban, TriangleAlert, Users } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { IconBadge } from '@/components/IconBadge'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { DoughnutChart } from '@/components/DoughnutChart'
import { MonthlyBarChart } from '@/components/MonthlyBarChart'
import { useAuthStore } from '@/stores/authStore'
import { useDashboard } from '@/queries/dashboard'
import { formatDate } from '@/lib/time'

const SCOPE_LABELS = {
  personal: 'Personal',
  branch: 'Branch',
  consultancy: 'Whole Consultancy',
} as const

type Scope = keyof typeof SCOPE_LABELS

// One icon + accent color per stat card key — the first (unallocated_leads) doubles as the hero
// card's icon. Each card gets a distinct color so the row reads at a glance, same idea as a
// colorful stat-card row (icon in a soft-tinted badge, not a flat monochrome list).
const STAT_META: Record<string, { icon: ReactNode; color: 'primary' | 'secondary' | 'warning' | 'success' }> = {
  unallocated_leads: { icon: <FolderKanban className="h-5 w-5" />, color: 'primary' },
  active_leads: { icon: <Users className="h-5 w-5" />, color: 'secondary' },
  unattended: { icon: <TriangleAlert className="h-5 w-5" />, color: 'warning' },
  converted: { icon: <CheckCircle2 className="h-5 w-5" />, color: 'success' },
}

// User-requested (2026-08-19) — "If any of KPIs should be redirected to another page, let us do
// that." Each stat card links to the list it's actually counting from, deep-linking a filter where
// one already exists (unattended -> Active Leads' own checkbox, via a query param it now reads).
const STAT_LINKS: Record<string, string> = {
  unallocated_leads: '/sales/lead-pool',
  active_leads: '/sales/active-leads',
  unattended: '/sales/active-leads?unattended=true',
  converted: '/clients',
}

// Renders as a plain Card (or bare div, for the hero card which already supplies its own full
// background/shadow classes) when no link is registered for this stat's key (STAT_LINKS above),
// otherwise as a Link styled identically — so callers don't need to know which one they got.
function CardOrLink({
  to,
  className,
  bare,
  children,
}: {
  to?: string
  className?: string
  bare?: boolean
  children: ReactNode
}) {
  if (!to) return bare ? <div className={className}>{children}</div> : <Card className={className}>{children}</Card>
  const classes = bare ? (className ?? '') : `rounded-lg bg-surface p-lg shadow-card ${className ?? ''}`
  return (
    <Link to={to} className={`block ${classes}`}>
      {children}
    </Link>
  )
}

// `isAnimationActive={false}` on the Bar below (found 2026-08-18, building the new chart
// components alongside this one) — recharts' entrance animation relies on animation frames that
// don't reliably fire in every environment (confirmed: this bar rendered zero `<path>`s, just
// empty wrapper `<g>`s, until animation was disabled), so every chart in the app disables it now.
function LeadsOverTimeChart({ points }: { points: { date: string; count: number }[] }) {
  if (points.length === 0) return <p className="text-body-sm text-text-secondary">No data yet.</p>
  const data = points.map((p) => ({
    date: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(p.date)),
    count: p.count,
  }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barCategoryGap="30%">
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
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
        <Bar
          dataKey="count"
          name="Leads"
          fill="var(--color-secondary)"
          radius={[6, 6, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const [scope, setScope] = useState<Scope>('personal')
  const dashboard = useDashboard(scope)

  const today = formatDate(new Date())

  if (dashboard.isLoading) {
    return (
      <AppShell>
        <div className="flex flex-col gap-md">
          <Skeleton className="h-24 rounded-lg" />
          <div className="grid grid-cols-4 gap-md">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        </div>
      </AppShell>
    )
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <AppShell>
        <ErrorState message="Could not load the dashboard." onRetry={() => dashboard.refetch()} />
      </AppShell>
    )
  }

  const data = dashboard.data
  const [heroCard, ...restCards] = data.stat_cards

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Welcome back, {user?.first_name ?? data.greeting_name}</h1>
            <p className="text-body-sm text-text-secondary">{today}</p>
          </div>
          {data.available_scopes.length > 1 && (
            <div className="flex gap-xs rounded-full border border-border bg-surface p-xs">
              {data.available_scopes.map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`rounded-full px-md py-xs text-body-sm transition-colors ${
                    scope === s ? 'bg-primary text-text-on-primary' : 'text-text-secondary'
                  }`}
                >
                  {SCOPE_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-md">
          {heroCard && (
            <CardOrLink
              to={STAT_LINKS[heroCard.key]}
              bare
              className="col-span-1 flex flex-col justify-between rounded-lg bg-primary p-lg text-text-on-primary shadow-card transition-opacity hover:opacity-90"
            >
              <div className="flex items-center justify-between">
                <p className="text-caption text-text-on-primary/80">{heroCard.label}</p>
                {STAT_META[heroCard.key] && (
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-text-on-primary/15">
                    {STAT_META[heroCard.key].icon}
                  </span>
                )}
              </div>
              <p className="text-display text-text-on-primary">{heroCard.value}</p>
            </CardOrLink>
          )}
          {restCards.map((card) => {
            const meta = STAT_META[card.key]
            return (
              <CardOrLink key={card.key} to={STAT_LINKS[card.key]} className="flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <p className="text-caption text-text-secondary">{card.label}</p>
                  {meta && <IconBadge color={meta.color}>{meta.icon}</IconBadge>}
                </div>
                <p className="text-h1 text-text-primary">{card.value}</p>
              </CardOrLink>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-md">
          <Card>
            <h2 className="text-h3 text-text-primary">Leads Over Time</h2>
            <div className="mt-sm">
              <LeadsOverTimeChart points={data.leads_over_time} />
            </div>
          </Card>
          <Card>
            <h2 className="text-h3 text-text-primary">Conversion Funnel</h2>
            <div className="mt-sm flex flex-col gap-xs">
              {(data.conversion_funnel ?? []).map((stage, _i, funnel) => (
                <div key={stage.stage} className="flex items-center gap-sm">
                  <span className="w-24 text-body-sm text-text-secondary">{stage.stage}</span>
                  <div className="h-3 flex-1 rounded-full bg-background">
                    <div
                      className="h-3 rounded-full bg-secondary"
                      style={{
                        width: `${funnel[0].count > 0 ? (stage.count / funnel[0].count) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="w-6 text-right text-body-sm text-text-primary">{stage.count}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* User-requested (2026-08-18) — "In consultancy dashboard also, show some more
            relevant graphs, instead of recent activities." Seats card removed (2026-08-19,
            user: "We do not have to show Seats in dashboard") — it already lives on Consultancy
            Management's own Subscription tab, so this was a duplicate. */}
        <Card>
          <h2 className="text-h3 text-text-primary">Applicant Status</h2>
          <div className="mt-sm">
            <DoughnutChart data={data.applicant_status_breakdown.map((d) => ({ label: d.label, value: d.count }))} />
          </div>
        </Card>

        <Card>
          <h2 className="text-h3 text-text-primary">New Applicants by Month</h2>
          <div className="mt-sm">
            <MonthlyBarChart
              data={data.applicants_over_time.map((d) => ({ month: d.month, value: d.count }))}
              valueLabel="New applicants"
              color="var(--color-primary)"
            />
          </div>
        </Card>

        {/* Only rendered for >1 branch (mock-server hides it entirely otherwise, user-requested
            2026-08-19 — "if only one branch, no point showing branch tab"). Caption names every
            included branch explicitly ("which all branches are included"), on top of each row
            already naming its own branch. */}
        {data.branch_breakdown && (
          <Card>
            <h2 className="text-h3 text-text-primary">Branch Breakdown</h2>
            <p className="mt-xs text-caption text-text-secondary">
              {data.branch_breakdown.length} branches: {data.branch_breakdown.map((b) => b.branch_name).join(', ')}
            </p>
            <div className="mt-sm flex flex-col gap-xs">
              {data.branch_breakdown.map((branch) => (
                <div key={branch.branch_id} className="flex items-center justify-between text-body-sm">
                  <span className="text-text-primary">{branch.branch_name}</span>
                  <span className="text-text-secondary">{branch.leads_count} leads</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  )
}

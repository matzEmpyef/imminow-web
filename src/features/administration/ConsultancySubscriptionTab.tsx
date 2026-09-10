// Split out of ConsultancyProfilePage.tsx (Phase 3 plan, Tier B2, 2026-09-03).
// Full width, Membership beside Seats and Billing (user, 2026-09-10: "cards in the tabs, use full
// width. make the UI/UX better for all the tabs").
import { CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { useMyConsultancy, useRequestUpgrade } from '@/queries/consultancy'
import { useEmployees } from '@/queries/staff'
import { formatDate } from '@/lib/time'
import { BUSINESS_FEATURES, ULTIMATE_FEATURES, STARTER_CORE_FEATURES, TIER_ORDER, TIER_LABEL } from '@/lib/features'
import { formatMoney } from '@/lib/money'

type Consultancy = NonNullable<ReturnType<typeof useMyConsultancy>['data']>

// Feature lists derived from the ONE exported registry (build reference 1.16 made real,
// 2026-08-29) rather than this page's own hand-maintained prose — see @/lib/features for the
// single source of truth also consumed by AppShell's nav gating and the Manage Consultancy
// toggle panel.

export function SubscriptionTab({ consultancy }: { consultancy: Consultancy }) {
  const requestUpgrade = useRequestUpgrade(consultancy.id)
  const employees = useEmployees()

  const tier = consultancy.tier
  const tierIndex = TIER_ORDER.indexOf(tier)
  const nextTier = TIER_ORDER[tierIndex + 1]
  // T2: meta.total when the server provides it — items.length is only ever one page, so a
  // consultancy over one page of employees under-reported its own seat usage.
  const seatsUsed = employees.data?.meta.total ?? employees.data?.items.length ?? 0
  const seatPct = consultancy.seat_limit > 0 ? Math.min(100, (seatsUsed / consultancy.seat_limit) * 100) : 0

  // The ACTUAL effective feature set — resolved preset ⊕ Super Admin override, off
  // `consultancy.features`, rather than a static per-tier list, so it always matches what's
  // actually reachable.
  const enabledFeatures = [...BUSINESS_FEATURES, ...ULTIMATE_FEATURES].filter((f) => consultancy.features?.[f.key])
  const included = [...STARTER_CORE_FEATURES, ...enabledFeatures.map((f) => f.label)]

  // Reflects the RECORDED request (persisted server-side), not local-only mutation state.
  const upgradeRequested = Boolean(consultancy.upgrade_requested_tier)

  return (
    <>
      <p className="text-body-sm text-text-secondary">
        Your current plan, what it includes, and how many of your seats are in use.
      </p>

      <div className="grid grid-cols-1 items-start gap-md lg:grid-cols-2">
        <Card className="lg:row-span-2">
          <div className="flex items-center justify-between gap-md">
            <h2 className="text-h3 text-text-primary">Membership</h2>
            <Badge color={tier === 'ultimate' ? 'primary' : tier === 'business' ? 'secondary' : 'info'}>
              {TIER_LABEL[tier] ?? tier} plan
            </Badge>
          </div>
          <p className="mt-xs text-caption text-text-secondary">What your plan includes</p>
          <ul className="mt-sm grid grid-cols-1 gap-x-md gap-y-xs sm:grid-cols-2">
            {included.map((feature) => (
              <li key={feature} className="flex items-start gap-xs text-body-sm text-text-primary">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                {feature}
              </li>
            ))}
          </ul>
          {nextTier && (
            <div className="mt-md flex flex-wrap items-center justify-between gap-sm border-t border-border pt-md">
              {upgradeRequested ? (
                <p className="text-body-sm text-success">
                  Requested — immiNow will contact you about upgrading to{' '}
                  {TIER_LABEL[consultancy.upgrade_requested_tier!]}.
                </p>
              ) : (
                <>
                  <p className="text-body-sm text-text-secondary">
                    Need more? {TIER_LABEL[nextTier] ?? nextTier} adds more features and seats.
                  </p>
                  <Button
                    variant="secondary"
                    loading={requestUpgrade.isPending}
                    onClick={() => requestUpgrade.mutate(nextTier as 'business' | 'ultimate')}
                  >
                    Upgrade to {TIER_LABEL[nextTier] ?? nextTier}
                  </Button>
                </>
              )}
              {requestUpgrade.isError && <p className="w-full text-body-sm text-error">{requestUpgrade.error.message}</p>}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-md">
            <h2 className="text-h3 text-text-primary">Seats</h2>
            <span className="text-body-sm tabular-nums text-text-secondary">
              {seatsUsed} of {consultancy.seat_limit} used
            </span>
          </div>
          <div className="mt-sm h-2 overflow-hidden rounded-full bg-background">
            <div className={`h-2 rounded-full ${seatPct >= 90 ? 'bg-warning' : 'bg-primary'}`} style={{ width: `${seatPct}%` }} />
          </div>
          <p className="mt-sm text-caption text-text-secondary">
            Each active employee account counts as one seat. Platform Admin adjusts your seat limit.
          </p>
        </Card>

        <BillingCard consultancy={consultancy} />
      </div>
    </>
  )
}

function BillingCard({ consultancy }: { consultancy: Consultancy }) {
  const { subscription_started_at, subscription_expires_at, billing_cycle, subscription_amount, billing_currency } =
    consultancy

  const daysLeft = subscription_expires_at
    ? Math.ceil((new Date(subscription_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : undefined

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'Plan started', value: subscription_started_at ? formatDate(subscription_started_at) : '—' },
    {
      label: 'Renews / expires',
      value: (
        <>
          {subscription_expires_at ? formatDate(subscription_expires_at) : '—'}
          {daysLeft !== undefined && (
            <span className={`ml-xs ${daysLeft <= 30 ? 'text-error' : 'text-text-secondary'}`}>
              ({daysLeft >= 0 ? `${daysLeft} days left` : `expired ${Math.abs(daysLeft)} days ago`})
            </span>
          )}
        </>
      ),
    },
    { label: 'Billing cycle', value: <span className="capitalize">{billing_cycle ?? '—'}</span> },
    { label: 'Amount', value: formatMoney(billing_currency, subscription_amount) },
  ]

  return (
    <Card>
      <h2 className="text-h3 text-text-primary">Billing</h2>
      <dl className="mt-sm grid grid-cols-1 gap-sm text-body-sm sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col">
            <dt className="text-caption text-text-secondary">{row.label}</dt>
            <dd className="text-text-primary">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-sm text-caption text-text-secondary">
        Billing terms are set by immiNow — contact Platform Admin for changes or renewal.
      </p>
    </Card>
  )
}

// Split out of ConsultancyProfilePage.tsx (Phase 3 plan, Tier B2, 2026-09-03) — pure movement, no logic change.
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { useMyConsultancy, useRequestUpgrade } from '@/queries/consultancy'
import { useEmployees } from '@/queries/staff'
import { formatDate } from '@/lib/time'
import { BUSINESS_FEATURES, ULTIMATE_FEATURES, STARTER_CORE_FEATURES, TIER_ORDER, TIER_LABEL } from '@/lib/features'
import { formatMoney } from '@/lib/money'

// Feature lists derived from the ONE exported registry (build reference 1.16 made real,
// 2026-08-29) rather than this page's own hand-maintained prose — see @/lib/features for the
// single source of truth also consumed by AppShell's nav gating and the Manage Consultancy
// toggle panel.

export function SubscriptionTab({ consultancy }: { consultancy: NonNullable<ReturnType<typeof useMyConsultancy>['data']> }) {
  const requestUpgrade = useRequestUpgrade(consultancy.id)
  const employees = useEmployees()

  const tier = consultancy.tier
  const tierIndex = TIER_ORDER.indexOf(tier)
  const nextTier = TIER_ORDER[tierIndex + 1]
  // T2: meta.total when the server provides it — items.length is only ever one page, so a
  // consultancy over one page of employees under-reported its own seat usage.
  const seatsUsed = employees.data?.meta.total ?? employees.data?.items.length ?? 0
  const seatPct = consultancy.seat_limit > 0 ? Math.min(100, (seatsUsed / consultancy.seat_limit) * 100) : 0

  // The ACTUAL effective feature set (build reference 1.16 made real, 2026-08-29) — resolved
  // preset ⊕ Super Admin override, off `consultancy.features`, rather than a static per-tier
  // list. A per-tier list would show the wrong thing the moment an override is in play (e.g. a
  // Starter consultancy with an individually-granted flag) — this always matches what's actually
  // reachable.
  const enabledFeatures = [...BUSINESS_FEATURES, ...ULTIMATE_FEATURES].filter((f) => consultancy.features?.[f.key])

  // Reflects the RECORDED request (persisted server-side via upgrade_requested_tier/_at), not
  // local-only mutation state — survives a reload instead of forgetting the moment the page
  // refreshes.
  const upgradeRequested = Boolean(consultancy.upgrade_requested_tier)

  return (
    <>
      <p className="text-body-sm text-text-secondary">
        Your current plan, what it includes, and how many of your seats are in use.
      </p>

      <Card className="max-w-[42rem]">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 text-text-primary">Membership</h2>
          <Badge color={tier === 'ultimate' ? 'primary' : tier === 'business' ? 'secondary' : 'info'}>
            {TIER_LABEL[tier] ?? tier} plan
          </Badge>
        </div>
        <ul className="mt-sm flex flex-col gap-xs">
          {STARTER_CORE_FEATURES.map((feature) => (
            <li key={feature} className="text-body-sm text-text-secondary">
              ✓ {feature}
            </li>
          ))}
          {enabledFeatures.map((feature) => (
            <li key={feature.key} className="text-body-sm text-text-secondary">
              ✓ {feature.label}
            </li>
          ))}
        </ul>
        {nextTier && (
          <div className="mt-md border-t border-border pt-md">
            {upgradeRequested ? (
              <p className="text-body-sm text-success">
                Requested — immiNow will contact you about upgrading to {TIER_LABEL[consultancy.upgrade_requested_tier!]}.
              </p>
            ) : (
              <Button
                variant="secondary"
                loading={requestUpgrade.isPending}
                onClick={() => requestUpgrade.mutate(nextTier as 'business' | 'ultimate')}
              >
                Upgrade to {TIER_LABEL[nextTier] ?? nextTier}
              </Button>
            )}
            {requestUpgrade.isError && (
              <p className="mt-xs text-body-sm text-error">{requestUpgrade.error.message}</p>
            )}
          </div>
        )}
      </Card>

      <Card className="max-w-[42rem]">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 text-text-primary">Seats</h2>
          <span className="text-body-sm text-text-secondary">
            {seatsUsed} of {consultancy.seat_limit} used
          </span>
        </div>
        <div className="mt-sm h-2 rounded-full bg-background">
          <div className="h-2 rounded-full bg-primary" style={{ width: `${seatPct}%` }} />
        </div>
        <p className="mt-sm text-caption text-text-secondary">
          Each active employee account counts as one seat. Platform Admin adjusts your seat limit.
        </p>
      </Card>

      <BillingCard consultancy={consultancy} />
    </>
  )
}

function BillingCard({ consultancy }: { consultancy: NonNullable<ReturnType<typeof useMyConsultancy>['data']> }) {
  const { subscription_started_at, subscription_expires_at, billing_cycle, subscription_amount, billing_currency } =
    consultancy

  const daysLeft = subscription_expires_at
    ? Math.ceil((new Date(subscription_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : undefined

  return (
    <Card className="max-w-[42rem]">
      <h2 className="text-h3 text-text-primary">Billing</h2>
      <dl className="mt-sm flex flex-col gap-xs text-body-sm">
        <div className="flex justify-between">
          <dt className="text-text-secondary">Plan started</dt>
          <dd className="text-text-primary">{subscription_started_at ? formatDate(subscription_started_at) : '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">Renews / expires</dt>
          <dd className="text-text-primary">
            {subscription_expires_at ? formatDate(subscription_expires_at) : '—'}
            {daysLeft !== undefined && (
              <span className={`ml-xs ${daysLeft <= 30 ? 'text-error' : 'text-text-secondary'}`}>
                ({daysLeft >= 0 ? `${daysLeft} days left` : `expired ${Math.abs(daysLeft)} days ago`})
              </span>
            )}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">Billing cycle</dt>
          <dd className="capitalize text-text-primary">{billing_cycle ?? '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">Amount</dt>
          <dd className="text-text-primary">
            {formatMoney(billing_currency, subscription_amount)}
          </dd>
        </div>
      </dl>
      <p className="mt-sm text-caption text-text-secondary">
        Billing terms are set by immiNow — contact Platform Admin for changes or renewal.
      </p>
    </Card>
  )
}

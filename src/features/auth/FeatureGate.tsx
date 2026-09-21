import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { useFeatures, TIER_LABEL, type FeatureDef } from '@/lib/features'
import { usePermissionChecker } from '@/lib/permissions'
import { useAccountWords } from '@/lib/accountWords'
import { ErrorState, Skeleton } from '@/components/QueryState'

/**
 * Page-level entitlement gate — the feature-flag counterpart to `PermissionGate`.
 *
 * Locked features stay hidden from the sidebar (AppShell filters nav on the same flags), but a
 * direct/bookmarked navigation to a gated route must still resolve to something other than the
 * page itself (build reference 1.16's "routes stay 403-safe" rule) — this is that fallback,
 * shaped exactly like `PermissionGate`'s loading/error/denied states so the two gates feel like
 * one system rather than two.
 *
 * This is navigation, not the security boundary — the server enforces the same flag on every
 * endpoint underneath the page (403 `feature_locked`). Hiding a page whose endpoints were open
 * would only have hidden the hole.
 */
export function FeatureGate({ feature, children }: { feature: FeatureDef; children: ReactNode }) {
  const { data: features, isLoading, isError } = useFeatures()
  // H14 (2026-09-13): telling the admin to go and ask the admin is a dead end. They hold the
  // upgrade, so they get the route to it instead.
  const { can } = usePermissionChecker()
  const { org } = useAccountWords()
  const isAccountAdmin = can('settings.edit_profile')

  if (isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 rounded-lg" />
      </AppShell>
    )
  }

  if (isError) {
    return (
      <AppShell>
        <ErrorState message="Could not check your plan's features." />
      </AppShell>
    )
  }

  if (!features[feature.key]) {
    // A STARTER flag is on for every plan, so it can only be off because a Super Admin switched it
    // off for this one account (2026-09-21, when branches moved down to Starter). "Upgrade to the
    // Starter plan" would be nonsense on a Starter account and worse on an Ultimate one — there is
    // nothing to upgrade to, and upgrading would not turn it back on.
    if (feature.tier === 'starter') {
      return (
        <AppShell>
          <Card>
            <p className="text-body text-error">{feature.label} is switched off for your account.</p>
            <p className="mt-xs text-body-sm text-text-secondary">
              It is part of every plan, so this was turned off for your {org} specifically. Contact Sentpo support to
              have it switched back on.
            </p>
          </Card>
        </AppShell>
      )
    }

    return (
      <AppShell>
        <Card>
          <p className="text-body text-error">{feature.label} isn't included in your current plan.</p>
          <p className="mt-xs text-body-sm text-text-secondary">
            This is part of the {TIER_LABEL[feature.tier]} plan.{' '}
            {isAccountAdmin ? (
              <>
                Upgrade from{' '}
                <Link
                  to="/administration/consultancy-profile"
                  className="font-medium text-primary hover:underline"
                >
                  Consultancy Management &rarr; Subscription
                </Link>
                .
              </>
            ) : (
              <>Ask your {org} admin to upgrade from Consultancy Management&rsquo;s Subscription tab.</>
            )}
          </p>
        </Card>
      </AppShell>
    )
  }

  return <>{children}</>
}

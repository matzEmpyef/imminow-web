import type { ReactNode } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { useFeatures, TIER_LABEL, type FeatureDef } from '@/lib/features'
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
    return (
      <AppShell>
        <Card>
          <p className="text-body text-error">{feature.label} isn't included in your current plan.</p>
          <p className="mt-xs text-body-sm text-text-secondary">
            This is part of the {TIER_LABEL[feature.tier]} plan. Ask your consultancy admin to upgrade from
            Consultancy Management's Subscription tab.
          </p>
        </Card>
      </AppShell>
    )
  }

  return <>{children}</>
}

import type { ReactNode } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { usePermissionChecker } from '@/lib/permissions'
import { ErrorState, Skeleton } from '@/components/QueryState'

/**
 * Page-level permission gate for the consultancy shell — the counterpart to `PlatformRoute` on
 * the console side.
 *
 * Added 2026-08-23 after a contract audit found the whole Staff Administration area (Employees,
 * Designations, Branches) reachable and usable by any logged-in consultant: the permission keys
 * existed, nothing checked them. Three pages needed the same gate, so it became a component
 * rather than a fourth copy of ConsultancyProfilePage's inline card.
 *
 * This is navigation, not the security boundary — the server enforces the same keys on every
 * /staff mutation. Hiding a page whose endpoints were open would only have hidden the hole.
 */
export function PermissionGate({
  permission,
  area,
  children,
}: {
  permission: string
  /** Named in the denial copy, e.g. "Staff Administration". */
  area: string
  children: ReactNode
}) {
  const { can, isLoading, isError, refetch } = usePermissionChecker()

  // A permission can't be resolved until the employee and designation queries land, and until
  // then every key answers false. Rendering the denial card during that window flashes "you don't
  // have access" at people who do — so hold the skeleton instead.
  if (isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 rounded-lg" />
      </AppShell>
    )
  }

  // Same reasoning one step further: if those queries FAILED, `can` still answers false for every
  // key, but that is a network failure, not a decision anyone made about this user. Saying "you
  // don't have access" here would invent a denial — and send them to their admin over what a
  // retry would fix.
  if (isError) {
    return (
      <AppShell>
        <ErrorState message="Could not check your permissions." onRetry={refetch} />
      </AppShell>
    )
  }

  if (!can(permission)) {
    return (
      <AppShell>
        <Card>
          <p className="text-body text-error">You don't have access to {area}.</p>
          <p className="mt-xs text-body-sm text-text-secondary">Contact your consultancy admin if you need this.</p>
        </Card>
      </AppShell>
    )
  }

  return <>{children}</>
}

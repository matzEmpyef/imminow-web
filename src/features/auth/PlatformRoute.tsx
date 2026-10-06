import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { SessionGate } from '@/features/auth/SessionGate'
import { scopeHomePath } from '@/lib/roleHome'
import type { components } from '@/api/schema'

export type PlatformPermissionKey = keyof components['schemas']['PlatformPermissions']

// Console route gate (build reference 1.23, user request #12). Replaced SuperAdminRoute
// (role === 'super_admin') on 2026-08-19: regular Platform Staff hold individually
// configurable flags, and gating the whole console on the role made those flags decorative.
// `platform_permissions` is server-resolved onto `GET /me`'s user — Super Admin arrives with
// every flag true, so this component never needs to know that rule. The same flags are
// enforced server-side on every admin endpoint; this gate is navigation, not the security
// boundary.
export function PlatformRoute({
  permission,
  anyPermission,
  children,
}: {
  /** Omit for pages every platform account may see (the console dashboard). */
  permission?: PlatformPermissionKey
  /** Opens for anyone holding at least one of these (2026-09-11 — Follow-ups: finance or support). */
  anyPermission?: PlatformPermissionKey[]
  children: ReactNode
}) {
  return (
    <SessionGate>
      {(me) => {
        // Not a platform account at all — send them to THEIR OWN shell (H4 fix, 1 Sep 2026): this
        // used to hardcode `/dashboard`, which bounced a Freelancer into the consultancy shell
        // they can't use either.
        if (me.scope !== 'platform') return <Navigate to={scopeHomePath(me.scope)} replace />
        // Read from `GET /me` on every visit (review F-036), not from a copy made at sign-in, so
        // a grant taken away stops opening its pages without a new sign-in.
        const permissions: Partial<Record<PlatformPermissionKey, boolean>> = me.user.platform_permissions ?? {}
        // A platform account missing this one flag stays inside the console, on its landing page —
        // /dashboard would bounce them into a shell they can't use either.
        if (permission && !permissions[permission]) return <Navigate to="/admin/dashboard" replace />
        if (anyPermission && !anyPermission.some((key) => permissions[key])) {
          return <Navigate to="/admin/dashboard" replace />
        }
        return children
      }}
    </SessionGate>
  )
}

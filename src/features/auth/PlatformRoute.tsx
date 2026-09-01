import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { roleHomePath } from '@/lib/roleHome'
import type { components } from '@/api/schema'

export type PlatformPermissionKey = keyof components['schemas']['PlatformPermissions']

// Console route gate (build reference 1.23, user request #12). Replaced SuperAdminRoute
// (role === 'super_admin') on 2026-08-19: regular Platform Staff hold individually
// configurable flags, and gating the whole console on the role made those flags decorative.
// `platform_permissions` is server-resolved onto the user object — Super Admin arrives with
// every flag true, so this component never needs to know that rule. The same flags are
// enforced server-side on every admin endpoint; this gate is navigation, not the security
// boundary.
export function PlatformRoute({
  permission,
  children,
}: {
  /** Omit for pages every platform account may see (the console dashboard). */
  permission?: PlatformPermissionKey
  children: ReactNode
}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const role = useAuthStore((s) => s.user?.role)
  const permissions = useAuthStore((s) => s.user?.platform_permissions)
  if (!isAuthed) return <Navigate to="/login" replace />
  // Not a platform account at all — send them to THEIR OWN shell (H4 fix, 1 Sep 2026): this used
  // to hardcode `/dashboard`, which bounced a Freelancer into the consultancy shell they can't use
  // either.
  if (!permissions) return <Navigate to={roleHomePath(role)} replace />
  // A platform account missing this one flag stays inside the console, on its landing page —
  // /dashboard would bounce them into a shell they can't use either.
  if (permission && !permissions[permission]) return <Navigate to="/admin/dashboard" replace />
  return <>{children}</>
}

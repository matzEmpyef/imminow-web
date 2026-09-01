import type { components } from '@/api/schema'

type Role = components['schemas']['User']['role']

/**
 * Where each role's shell begins — the one place "which shell does this role get" is decided, so
 * it can't drift between call sites the way the frontend review (M12/M13/M14, 1 Sep 2026) found
 * it had: `DefaultRedirect`, the wrong-role bounce inside `PlatformRoute`/`FreelancerRoute`/
 * `ConsultancyRoute`, `LoginPage`'s already-authenticated bounce, and `SetPasswordPage`'s
 * post-accept redirect all use this instead of re-deriving the same three-way branch.
 */
export function roleHomePath(role: Role | undefined): string {
  if (role === 'super_admin' || role === 'platform_staff') return '/admin/dashboard'
  if (role === 'freelancer') return '/freelancer/dashboard'
  return '/dashboard'
}

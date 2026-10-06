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
  // Students belong in the Sentpo app, but they CAN authenticate here (one identity system) and
  // must not fall through to '/dashboard': ConsultancyRoute bounces non-staff back through this
  // function, so that fall-through is a redirect loop. '/account' is the one page every role
  // legitimately owns (ProtectedRoute-only; MyAccountPage already branches on the student role).
  if (role === 'student') return '/account'
  return '/dashboard'
}

type Scope = components['schemas']['Me']['scope']

/**
 * The same decision from `GET /me`'s `scope` (review F-036): the server names the part of the
 * product the caller belongs to, so the guards no longer infer it from the role. An institute is a
 * college's own account and uses the consultancy shell.
 */
export function scopeHomePath(scope: Scope | undefined): string {
  if (scope === 'platform') return '/admin/dashboard'
  if (scope === 'freelancer') return '/freelancer/dashboard'
  if (scope === 'student') return '/account'
  return '/dashboard'
}

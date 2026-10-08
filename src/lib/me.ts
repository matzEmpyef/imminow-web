import { useMe, type MeScope, type MeStaff, type MeUser, type PlatformPermissions } from '@/queries/me'

// What the screens read off `GET /me` (review F-036). Kept apart from the query itself
// (`queries/me.ts`) so that everything here goes through the one exported `useMe`: a test that
// replaces `useMe` changes every answer below with it.

/** The signed-in person's own record; undefined until `/me` has answered. */
export function useMeUser(): MeUser | undefined {
  return useMe().data?.user
}

export function useMyUserId(): string | undefined {
  return useMe().data?.user.id
}

export function useMyRole(): MeUser['role'] | undefined {
  return useMe().data?.user.role
}

export function useMyScope(): MeScope | undefined {
  return useMe().data?.scope
}

/** The caller's own employee row and what it lets them do; null for anyone who is not staff. */
export function useMeStaff(): MeStaff | null | undefined {
  return useMe().data?.staff
}

export function useIsSuperAdmin(): boolean {
  return useMe().data?.user.role === 'super_admin'
}

/**
 * A platform account's console grants (every key true for a Super Admin). Undefined for anyone
 * else, and until `/me` has answered.
 */
export function usePlatformPermissions(): Partial<PlatformPermissions> | undefined {
  const me = useMe().data
  if (!me || me.scope !== 'platform') return undefined
  return me.user.platform_permissions ?? {}
}

/** One platform grant. Fails closed while loading. */
export function usePlatformPermission(key: keyof PlatformPermissions): boolean {
  return usePlatformPermissions()?.[key] === true
}

/**
 * Whether this platform account is sent the COMMERCIAL side of a consultancy (review F-129/F-130):
 * plan, seat limit and seats used, subscription dates and amounts, active applicants, and the
 * per-plan counts. The server sends them only to the Super Admin and to platform staff holding
 * `consultancy_approval` or `finance`; for anyone else the fields are absent, the `tier=` and
 * `status=` filters are ignored and the plan sorts fall back to name. A screen hides those
 * columns, filters and sorts on this answer, so nobody is shown an empty column or a control that
 * does nothing. Fails closed while loading.
 */
export function useCanSeeConsultancyPlans(): boolean {
  const permissions = usePlatformPermissions()
  return permissions?.consultancy_approval === true || permissions?.finance === true
}

/**
 * Whether this account may export a student's conversation with a consultancy (owner decision 61,
 * 2026-10-08): platform staff holding `support` (disputes and complaints), and Super Admins. The
 * server decides again on every request. Fails closed while loading.
 */
export function useCanExportConversations(): boolean {
  const isSuperAdmin = useIsSuperAdmin()
  const hasGrant = usePlatformPermission('support')
  return isSuperAdmin || hasGrant
}

/** The list columns that are plan data, which are also the sorts only those accounts may use. */
export const CONSULTANCY_PLAN_COLUMNS: readonly string[] = ['tier', 'subscription', 'seats_used', 'active_applicants']

/** Consultancy or institute staff: the people the consultancy shell is for. */
export function isStaffScope(scope: MeScope | undefined): boolean {
  return scope === 'consultancy' || scope === 'institute'
}

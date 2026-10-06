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

/** Consultancy or institute staff: the people the consultancy shell is for. */
export function isStaffScope(scope: MeScope | undefined): boolean {
  return scope === 'consultancy' || scope === 'institute'
}

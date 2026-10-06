import { vi } from 'vitest'
import { ApiError } from '@/api/errors'
import type { Me, MeStaff, useMe } from '@/queries/me'

/**
 * `GET /me` answers for tests (review F-036). Every guard, shell, `can()` and `useFeature()` reads
 * the one `useMe` query, so a test that wants "signed in as X" replaces that one hook:
 *
 *   vi.mock('@/queries/me', async (importOriginal) => ({
 *     ...(await importOriginal<typeof import('@/queries/me')>()),
 *     useMe: vi.fn(),
 *   }))
 *   vi.mocked(useMe).mockReturnValue(meAnswered(staffMe({ permissions: ['clients.close'] })))
 */
type MeQuery = ReturnType<typeof useMe>

const USER = {
  id: 'u1',
  email: 'asha@example.test',
  first_name: 'Asha',
  last_name: 'Nair',
  role: 'consultant',
} as Me['user']

const STAFF: MeStaff = {
  employee_id: 'e1',
  consultancy_id: 'c1',
  consultancy_name: 'Bright Path',
  consultancy_kind: 'consultancy',
  college_id: null,
  tier: 'business',
  is_admin: false,
  designation_id: 'd1',
  designation_name: 'Counsellor',
  branch_ids: [],
  primary_branch_id: null,
  permissions: [],
  available_permissions: [],
  features: [],
  lapsed: false,
}

/** Consultancy staff (pass `consultancy_kind: 'institute'` for a college's own account). */
export function staffMe(staff: Partial<MeStaff> = {}, user: Partial<Me['user']> = {}): Me {
  const row = { ...STAFF, ...staff }
  return {
    user: { ...USER, role: row.is_admin ? 'consultancy_admin' : 'consultant', ...user } as Me['user'],
    scope: row.consultancy_kind === 'institute' ? 'institute' : 'consultancy',
    staff: row,
  }
}

/** A platform account with these console grants. */
export function platformMe(
  permissions: Record<string, boolean> = {},
  user: Partial<Me['user']> = {},
): Me {
  return {
    user: { ...USER, role: 'platform_staff', platform_permissions: permissions, ...user } as Me['user'],
    scope: 'platform',
    staff: null,
  }
}

/** A freelancer or a student: signed in, not staff of anything. */
export function plainMe(scope: 'freelancer' | 'student'): Me {
  return { user: { ...USER, role: scope } as Me['user'], scope, staff: null }
}

function query(overrides: Record<string, unknown>): MeQuery {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isPending: false,
    isError: false,
    isFetching: false,
    isSuccess: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as MeQuery
}

/** The server answered. */
export function meAnswered(me: Me, overrides: Record<string, unknown> = {}): MeQuery {
  return query({ data: me, isSuccess: true, ...overrides })
}

/** The first answer is still on its way. */
export function meLoading(): MeQuery {
  return query({ isLoading: true, isPending: true, isFetching: true })
}

/** The read failed; `previous` is the answer still held from before, if there was one. */
export function meFailed(error: unknown = new TypeError('Failed to fetch'), previous?: Me, refetch = vi.fn()): MeQuery {
  return query({ data: previous, error, isError: true, refetch })
}

/** `/me` itself refused the caller: 403 `account_disabled` or `subscription_lapsed`. */
export function meRefused(code: 'account_disabled' | 'subscription_lapsed', message: string, previous?: Me): MeQuery {
  return meFailed(new ApiError('Could not load your account.', { error: { code, message } }, 403), previous)
}

/** Nobody is signed in (the query is switched off). */
export function meSignedOut(): MeQuery {
  return query({ isPending: true })
}

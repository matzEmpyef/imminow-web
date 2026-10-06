import { useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { ApiError } from '@/api/errors'
import { useAuthStore } from '@/stores/authStore'
import type { components } from '@/api/schema'

type Nullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null }

// The contract marks these nullable beside a `$ref`, which the type generator drops; the
// description is explicit (`staff` is null for anyone who is not consultancy or institute staff),
// so the types say so here rather than letting a caller forget the null.
export type MeStaff = Nullable<
  components['schemas']['MeStaff'],
  'college_id' | 'designation_id' | 'primary_branch_id'
>
export type Me = Omit<components['schemas']['Me'], 'staff'> & { staff: MeStaff | null }
export type MeUser = components['schemas']['User']
export type MeScope = Me['scope']
export type PlatformPermissions = components['schemas']['PlatformPermissions']

/**
 * "Who am I" (review F-036). ONE query on `GET /me`, the server's own answer on this request:
 * who the caller is, which shell they get (`scope`), and for consultancy and institute staff the
 * permissions and plan features the server's access checks use (`staff`).
 *
 * It replaced three things the console used to work out for itself: its own row in the employee
 * list (paged at 100, so the newest staff of a large consultancy lost every screen), the `user`
 * object stored at sign-in (a snapshot: a revoked permission stayed visible until the next
 * sign-in), and the features on the consultancy record.
 *
 * Lives in the query cache only. It is never written to sessionStorage, so a reload asks the
 * server again; the guards hold a loading screen until the answer is in.
 */
export const ME_QUERY_KEY = ['me'] as const

/** Fresh for a minute; a return to the tab after that asks again. */
const ME_STALE_MS = 60_000

/** The two refusals `/me` gives a signed-in person: the console shows the message, not a shell. */
export const ME_BLOCKED_CODES = ['account_disabled', 'subscription_lapsed'] as const

/**
 * Refusals on ANY request that mean what the console believes about the caller is out of date, so
 * `/me` is asked again (see `api/client.ts`).
 */
export const ME_STALE_REFUSAL_CODES = ['permission_denied', 'feature_locked', 'subscription_lapsed'] as const

/** `token` is for the one call made before the session is stored (sign-in, accepting an invite). */
export async function fetchMe(token?: string): Promise<Me> {
  const { data, error, response } = await api.GET('/me', token ? { headers: { Authorization: `Bearer ${token}` } } : {})
  if (error || !data) throw new ApiError('Could not load your account.', error, response?.status)
  return data as Me
}

/**
 * Puts the answer in the cache right after a sign-in, before the tokens are stored, so the first
 * screen is drawn from the server's answer with no loading state in between. A failure here is
 * left for the guards to show: it must never turn a successful sign-in into a failed one.
 */
export async function primeMe(queryClient: QueryClient, accessToken: string): Promise<void> {
  try {
    queryClient.setQueryData(ME_QUERY_KEY, await fetchMe(accessToken))
  } catch {
    queryClient.removeQueries({ queryKey: ME_QUERY_KEY })
  }
}

export function useMe() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => fetchMe(),
    enabled: isAuthed,
    staleTime: ME_STALE_MS,
    refetchOnWindowFocus: true,
  })
}

/** `/me` refused the caller outright (disabled account, or staff of a lapsed consultancy). */
export function meBlockedError(error: unknown): ApiError | null {
  return error instanceof ApiError && (ME_BLOCKED_CODES as readonly string[]).includes(error.code ?? '') ? error : null
}

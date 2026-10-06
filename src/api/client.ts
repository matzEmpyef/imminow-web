import createClient from 'openapi-fetch'
import type { components, paths } from './schema'
import { useAuthStore } from '@/stores/authStore'
import { endSession } from '@/lib/session'
import { queryClient } from '@/lib/queryClient'

const baseUrl = import.meta.env.VITE_API_BASE_URL

export const api = createClient<paths>({ baseUrl })

// Refresh-on-401 (added 2026-08-25), mirroring what mobile already does in
// `auth_provider.dart`'s `_refreshSession`. Before this, `onResponse` cleared the session on any
// 401 and the stored refresh token was never spent — invisible against the mock, whose access
// tokens never expire, but under Cognito's one-hour tokens it would log every user out mid-task.
//
// Endpoints where a 401 is the ANSWER rather than an expired session. Refreshing after a wrong
// password would be nonsense, and `/auth/refresh` refreshing itself is the recursion this whole
// design has to avoid.
const AUTH_PATHS = new Set([
  '/auth/login',
  '/auth/refresh',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
])

// A request cannot be replayed after `fetch` has consumed its body, so a clone is taken at send
// time and kept until the response lands. Keyed by openapi-fetch's per-request `id`; cleared in
// both `onResponse` and `onError` so a failed request cannot leak one.
const replayable = new Map<string, Request>()

/**
 * Single-flight refresh. A page mounting several queries at once will produce several simultaneous
 * 401s; without this they would each fire their own refresh, and every one after the first would
 * present an already-rotated token. They share one promise instead.
 */
let refreshInFlight: Promise<string | null> | null = null

/**
 * Exported so the idle lock's "Stay signed in" (`lib/idleLock`) can trigger the exact same refresh
 * the 401 interceptor below uses, rather than a second, subtly different implementation — the real
 * backend refuses this after 30 minutes idle (`auth_sessions`), which is exactly why calling it
 * before that mark is itself the activity signal the server needs.
 */
export async function requestNewAccessToken(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken
  if (!refreshToken) return null
  try {
    // Bare `fetch`, not `api` — the client is mid-flight handling the very 401 that triggered
    // this, and routing the refresh back through its own middleware invites recursion. Same
    // reasoning as mobile's bare Dio instance.
    const response = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!response.ok) return null
    const body = (await response.json()) as Partial<components['schemas']['TokenRefresh']>
    const accessToken = body.access_token
    if (!accessToken) return null
    // `refresh_token` is present only when the server rotated it; the store keeps the one it
    // already holds otherwise.
    useAuthStore.getState().setAccessToken(accessToken, body.refresh_token)
    return accessToken
  } catch {
    // Network failure during refresh is not proof the session is dead, but there is nothing else
    // to try — the caller ends the session either way.
    return null
  }
}

function refreshOnce(): Promise<string | null> {
  refreshInFlight ??= requestNewAccessToken().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

// Refusals that mean the console's picture of the caller is out of date (review F-036): a
// permission was taken away, a plan feature was switched off, or the subscription lapsed since
// `GET /me` last answered. Asking `/me` again is what makes the buttons and pages on screen match
// what the server will now allow. The literal key and codes are repeated from `queries/me.ts`
// rather than imported: that module imports this one.
const ME_QUERY_KEY = ['me']
const ME_STALE_REFUSAL_CODES = new Set(['permission_denied', 'feature_locked', 'subscription_lapsed'])

async function refreshMeOnStaleRefusal(response: Response, schemaPath: string) {
  // `/me` refusing is its own answer (the guards show it); asking again would loop.
  if (response.status !== 403 || schemaPath === '/me') return
  try {
    const body = (await response.clone().json()) as { error?: { code?: string } }
    if (!ME_STALE_REFUSAL_CODES.has(body.error?.code ?? '')) return
    // `cancelRefetch: false`: a page whose five lists are all refused asks once, not five times.
    void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }, { cancelRefetch: false })
  } catch {
    // Not a JSON error envelope: nothing to learn from it.
  }
}

api.use({
  onRequest({ request, id }) {
    const token = useAuthStore.getState().accessToken
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    replayable.set(id, request.clone())
    return request
  },

  async onResponse({ response, id, schemaPath }) {
    const original = replayable.get(id)
    replayable.delete(id)

    if (response.status !== 401) {
      await refreshMeOnStaleRefusal(response, schemaPath)
      return response
    }
    // A 401 from login means wrong credentials, not an expired session. Returned untouched so the
    // form can show the server's own message.
    if (AUTH_PATHS.has(schemaPath)) return response

    const accessToken = await refreshOnce()
    // These three teardown sites end the session the same way the Log out button does (N1,
    // second-pass review): store AND query cache, via the one shared helper — clearing only the
    // store left the previous account's cached lists readable by the next account in this tab.
    if (!accessToken || !original) {
      endSession()
      return response
    }

    const headers = new Headers(original.headers)
    headers.set('Authorization', `Bearer ${accessToken}`)
    let retried: Response
    try {
      retried = await fetch(new Request(original, { headers }))
    } catch {
      endSession()
      return response
    }

    // A freshly-issued token that still gets refused means the session is genuinely finished, not
    // merely stale. No second attempt — the replay runs through bare `fetch`, so it never
    // re-enters this middleware and cannot loop.
    if (retried.status === 401) endSession()
    else await refreshMeOnStaleRefusal(retried, schemaPath)
    return retried
  },

  onError({ id }) {
    replayable.delete(id)
  },
})

import createClient from 'openapi-fetch'
import type { components, paths } from './schema'
import { currentSessionEpoch, useAuthStore } from '@/stores/authStore'
import { endSession } from '@/lib/session'
import { queryClient } from '@/lib/queryClient'
import { withErrorEnvelope } from './errors'
import { guardedFetch } from './http'

const baseUrl = import.meta.env.VITE_API_BASE_URL

// Every request goes out through `guardedFetch` (review F-150): a time limit, a plain message
// when there is no connection, and an immediate failure while the browser is offline.
export const api = createClient<paths>({ baseUrl, fetch: (request) => guardedFetch(request) })

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
  // Signing out with a token the server no longer accepts has still signed out.
  '/auth/logout',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
])

// A request cannot be replayed after `fetch` has consumed its body, so a clone is taken at send
// time and kept until the response lands. Keyed by openapi-fetch's per-request `id`; cleared in
// both `onResponse` and `onError` so a failed request cannot leak one. Beside the clone: the token
// the request actually carried and the session it was sent under, so a refusal that comes back
// after the session changed is recognised (review F-165).
interface SentRequest {
  request: Request
  token: string | null
  epoch: number
}
const replayable = new Map<string, SentRequest>()

/**
 * What asking the server for a new access token came to (review F-165):
 *
 *   ok           a new token is stored
 *   rejected     the server refused the refresh token itself (400, 401 or 403): the session is over
 *   unavailable  no answer worth acting on (no connection, a server error, too many requests, an
 *                unreadable reply, or the session changed while the call was out): the session is
 *                left exactly as it was and the caller may try again
 *
 * Only `rejected` may end a session. Before this, any hiccup on this one call signed the person
 * out and threw away what they were typing; during a deploy that was every console whose token
 * happened to expire in that window.
 */
export type RefreshResult = { kind: 'ok'; accessToken: string } | { kind: 'rejected' } | { kind: 'unavailable' }

const REFRESH_REJECTED_STATUSES = new Set([400, 401, 403])

/**
 * Single-flight refresh. A page mounting several queries at once will produce several simultaneous
 * 401s; without this they would each fire their own refresh, and every one after the first would
 * present an already-rotated token. They share one promise instead.
 */
let refreshInFlight: Promise<RefreshResult> | null = null

async function requestRefresh(): Promise<RefreshResult> {
  const refreshToken = useAuthStore.getState().refreshToken
  if (!refreshToken) return { kind: 'rejected' }
  const epoch = currentSessionEpoch()
  try {
    // Not `api` — the client is mid-flight handling the very 401 that triggered
    // this, and routing the refresh back through its own middleware invites recursion. Same
    // reasoning as mobile's bare Dio instance.
    const response = await guardedFetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (REFRESH_REJECTED_STATUSES.has(response.status)) return { kind: 'rejected' }
    if (!response.ok) return { kind: 'unavailable' }
    const body = (await response.json()) as Partial<components['schemas']['TokenRefresh']>
    const accessToken = body.access_token
    if (!accessToken) return { kind: 'unavailable' }
    // The person signed out, or someone else signed in, while this call was out: the answer
    // belongs to a session that is gone and must not be written over the current one.
    if (currentSessionEpoch() !== epoch) return { kind: 'unavailable' }
    // `refresh_token` is present only when the server rotated it; the store keeps the one it
    // already holds otherwise.
    useAuthStore.getState().setAccessToken(accessToken, body.refresh_token)
    return { kind: 'ok', accessToken }
  } catch {
    // No answer at all (a dropped connection) or one that could not be read. Neither says the
    // session is over.
    return { kind: 'unavailable' }
  }
}

/** The one refresh every caller shares; see `RefreshResult`. */
export function refreshSession(): Promise<RefreshResult> {
  refreshInFlight ??= requestRefresh().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

/**
 * Exported so the idle lock's "Stay signed in" (`lib/idleLock`) can trigger the exact same refresh
 * the 401 interceptor below uses, rather than a second, subtly different implementation — the real
 * backend refuses this after 30 minutes idle (`auth_sessions`), which is exactly why calling it
 * before that mark is itself the activity signal the server needs. Gives the new token, or `null`
 * when none was issued for any reason; a caller that must tell a refusal from a hiccup uses
 * `refreshSession`.
 */
export async function requestNewAccessToken(): Promise<string | null> {
  const result = await refreshSession()
  return result.kind === 'ok' ? result.accessToken : null
}

/**
 * What a request gets back when its session could not be renewed for a reason that is not a
 * refusal. It travels as an ordinary error answer, so every screen shows it the way it shows any
 * other failed request, and the session stays open for the next attempt.
 */
function sessionCheckUnavailable(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 'session_check_unavailable',
        message: 'We could not reach the server. Check your connection and try again.',
      },
    }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  )
}

function bearerOf(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
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

// Registered first, so it handles each answer LAST (answers pass through the middleware in
// reverse order): whatever is finally handed to the caller, a failure always carries the error
// envelope and its status. See `withErrorEnvelope`.
api.use({
  onResponse: ({ response }) => withErrorEnvelope(response),
})

api.use({
  onRequest({ request, id }) {
    // A caller that names its own token (the one `/me` call made before a new session is stored,
    // and Log out) keeps it: the store may still hold a different account's.
    if (!request.headers.has('Authorization')) {
      const token = useAuthStore.getState().accessToken
      if (token) request.headers.set('Authorization', `Bearer ${token}`)
    }
    replayable.set(id, { request: request.clone(), token: bearerOf(request), epoch: currentSessionEpoch() })
    return request
  },

  async onResponse({ response, id, schemaPath }) {
    const sent = replayable.get(id)
    replayable.delete(id)

    if (response.status !== 401) {
      await refreshMeOnStaleRefusal(response, schemaPath)
      return response
    }
    // A 401 from login means wrong credentials, not an expired session. Returned untouched so the
    // form can show the server's own message.
    if (AUTH_PATHS.has(schemaPath)) return response

    // Whose refusal is this? Only a request sent with a token, under the session that is still
    // the current one, says anything about the current session. A refusal for a request sent
    // before a sign-out (or under the account that was here before this one) is that old
    // session's business: acting on it would sign the new person out, or replay the old request
    // as the new person.
    const currentToken = useAuthStore.getState().accessToken
    if (!sent || !sent.token || !currentToken || sent.epoch !== currentSessionEpoch()) return response

    let accessToken = currentToken
    let renewedHere = false
    // A different token in the store means this session was already renewed while the request was
    // out, so the newer token is simply tried. The same token means it is the one that expired.
    if (sent.token === currentToken) {
      const refreshed = await refreshSession()
      // The session may have changed hands while the refresh was out.
      if (sent.epoch !== currentSessionEpoch()) return response
      // The session ends the same way the Log out button ends it (N1, second-pass review): store
      // AND query cache, via the one shared helper — clearing only the store left the previous
      // account's cached lists readable by the next account in this tab.
      if (refreshed.kind === 'rejected') {
        endSession('expired')
        return response
      }
      if (refreshed.kind === 'unavailable') return sessionCheckUnavailable()
      accessToken = refreshed.accessToken
      renewedHere = true
    }

    const headers = new Headers(sent.request.headers)
    headers.set('Authorization', `Bearer ${accessToken}`)
    let retried: Response
    try {
      retried = await guardedFetch(new Request(sent.request, { headers }))
    } catch {
      // The connection dropped on the second attempt. That is not the session ending.
      return sessionCheckUnavailable()
    }

    // A freshly-issued token that still gets refused means the session is genuinely finished, not
    // merely stale. No second attempt — the replay runs through bare `fetch`, so it never
    // re-enters this middleware and cannot loop.
    if (retried.status === 401) {
      const stillCurrent = sent.epoch === currentSessionEpoch() && useAuthStore.getState().accessToken === accessToken
      if (renewedHere && stillCurrent) endSession('expired')
    } else {
      await refreshMeOnStaleRefusal(retried, schemaPath)
    }
    return retried
  },

  onError({ id }) {
    replayable.delete(id)
  },
})

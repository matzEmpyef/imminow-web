import createClient from 'openapi-fetch'
import type { paths } from './schema'
import { useAuthStore } from '@/stores/authStore'
import { endSession } from '@/lib/session'

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

async function requestNewAccessToken(): Promise<string | null> {
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
    const body = (await response.json()) as { access_token?: string }
    const accessToken = body.access_token
    if (!accessToken) return null
    useAuthStore.getState().setAccessToken(accessToken)
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

    if (response.status !== 401) return response
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
    return retried
  },

  onError({ id }) {
    replayable.delete(id)
  },
})

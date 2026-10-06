import { api, refreshSession } from '@/api/client'
import { ApiError } from '@/api/errors'
import { queryClient } from '@/lib/queryClient'
import { endSession } from '@/lib/session'
import { useAuthStore } from '@/stores/authStore'
import { RealtimeConnectionManager, type TicketResult } from './connectionManager'

/**
 * `POST /realtime/tickets` (Wave 3 plan §6.1), classified into what the manager needs to decide
 * next. 503 `realtime_disabled` — the mock server, a server flag, or Redis down — means "keep
 * polling, ask again later"; `details.retry_after_s` names later (openapi.yaml's own doc comment
 * on the operation), defaulting to 300s if the server ever omits it.
 */
export async function fetchRealtimeTicket(): Promise<TicketResult> {
  const { data, error, response } = await api.POST('/realtime/tickets')
  if (error) {
    const apiError = new ApiError('Could not open the realtime socket.', error)
    if (response.status === 503 || apiError.code === 'realtime_disabled') {
      const retryAfterS = typeof apiError.details?.retry_after_s === 'number' ? apiError.details.retry_after_s : 300
      return { ok: false, reason: 'disabled', retryAfterS }
    }
    if (response.status === 429 || apiError.code === 'rate_limited') {
      return { ok: false, reason: 'rate_limited' }
    }
    return { ok: false, reason: 'error' }
  }
  return { ok: true, url: data.url }
}

/**
 * The one connection manager for the whole tab (Wave 3 plan §6.6) — a plain module singleton, not
 * a React component, so it can be started from `main.tsx` the same way `startAnalytics()` is, and
 * so `queries/leads.ts`/`clients.ts`/`conversations.ts` can read its state without needing to be
 * inside whatever tree mounts it.
 */
export const realtimeManager = new RealtimeConnectionManager({
  queryClient,
  fetchTicket: fetchRealtimeTicket,
  isSignedIn: () => Boolean(useAuthStore.getState().accessToken),
  // A 4401 close is the server saying the session needs renewing (review F-142): the same refresh
  // every request uses, and the same ending (with the reason on the login page) if it is refused.
  refreshSession: () => refreshSession(),
  onSessionEnded: () => endSession('expired'),
})

/**
 * Starts the manager if a session already exists, and from then on starts/stops it exactly on the
 * sign-in/sign-out edges of `authStore` — NOT on every access-token change, since a same-session
 * token refresh (`setAccessToken`) fires that same subscription without ending the session. Call
 * once, from `main.tsx`.
 *
 * Idle lock: the console's idle-lock/auto-logout mechanism this was written to hook into does not
 * exist yet (`PROGRESS.md`'s Pre-Production Checklist still lists "Idle auto-lock: Not
 * implemented"). Sign-out is therefore the only stop condition wired up today; `realtimeManager` is
 * exported so that feature, whenever it lands, can call `.stop()`/`.start()` around the lock the
 * same way `endSession`/sign-in do here.
 */
export function startRealtime(): void {
  let wasSignedIn = Boolean(useAuthStore.getState().accessToken)
  if (wasSignedIn) realtimeManager.start()

  useAuthStore.subscribe((state) => {
    const isSignedIn = Boolean(state.accessToken)
    if (isSignedIn && !wasSignedIn) realtimeManager.start()
    if (!isSignedIn && wasSignedIn) realtimeManager.stop()
    wasSignedIn = isSignedIn
  })
}

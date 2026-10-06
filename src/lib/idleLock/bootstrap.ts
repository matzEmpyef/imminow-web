import { requestNewAccessToken } from '@/api/client'
import { endSession } from '@/lib/session'
import { useAuthStore } from '@/stores/authStore'
import { sessionKeyFromRefreshToken } from './activityChannel'
import { IdleLockManager, type IdleLockReason } from './idleLockManager'

/**
 * Ends the session the same way Log out and the 401 interceptor do (`lib/session.ts`'s
 * `endSession` — the one way a session ends): clears the auth store and the query cache.
 * Deliberately does not navigate or stop the realtime socket directly — `endSession()` clearing
 * the access token is exactly the edge `ProtectedRoute`/`ConsultancyRoute` bounce to `/login` on
 * and `lib/realtime/bootstrap.ts`'s own `authStore` subscription stops `realtimeManager` on, so
 * both already happen as a consequence, the same way they do for the Log out button.
 *
 * The reason goes with it (review F-165): the login page says why the session ended and keeps
 * saying it until the person signs in (it used to be a toast, gone after five seconds, which
 * someone coming back from lunch never saw), and the same person is taken back to the page they
 * were on. The wording is `SESSION_END_MESSAGES` in `lib/sessionNotice.ts`.
 */
function lockSession(reason: IdleLockReason): void {
  endSession(reason)
}

/**
 * One idle-lock manager for the tab (console only — TRD Section 9, REVIEW_TRIAGE item 24; the
 * mobile staff shell keeps its own 30-day refresh instead): warns at 28 minutes idle, signs out at
 * 30, and caps every session at 12 hours regardless of activity. "Stay signed in" reuses the exact
 * refresh the 401 interceptor uses, so the real backend sees the same normal authenticated call
 * either way.
 */
export const idleLockManager = new IdleLockManager({
  onLock: lockSession,
  refreshSession: async () => {
    await requestNewAccessToken()
  },
  sessionKey: () => sessionKeyFromRefreshToken(useAuthStore.getState().refreshToken),
})

/**
 * Starts the manager if a session already exists (a page reload mid-session), and from then on
 * starts/stops it exactly on the sign-in/sign-out edges of `authStore` — the same shape as
 * `lib/realtime/bootstrap.ts`'s `startRealtime()`, and for the same reason: a same-session token
 * refresh (`setAccessToken`) must not restart the idle clock. A reload continues the session's
 * existing clock; a sign-in always starts a fresh one. Call once, from `main.tsx`.
 */
export function startIdleLock(): void {
  let wasSignedIn = Boolean(useAuthStore.getState().accessToken)
  if (wasSignedIn) idleLockManager.start()

  useAuthStore.subscribe((state) => {
    const isSignedIn = Boolean(state.accessToken)
    if (isSignedIn && !wasSignedIn) idleLockManager.start({ fresh: true })
    if (!isSignedIn && wasSignedIn) idleLockManager.stop()
    wasSignedIn = isSignedIn
  })
}

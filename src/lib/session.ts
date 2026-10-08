import { useAuthStore } from '@/stores/authStore'
import { queryClient } from '@/lib/queryClient'
import { noteSessionEnded, type SessionEndReason } from '@/lib/sessionNotice'
import { useChatWindowStore } from '@/stores/chatWindowStore'

/**
 * The ONE way a session ends (N1, second-pass review, 1 Sep 2026). There are two paths out of an
 * authenticated session — the Log out button (SidebarShell) and the 401 interceptor in
 * api/client.ts giving up after a failed refresh — and before this helper only the button cleared
 * the React Query cache. The interceptor path left the previous account's client lists and
 * dashboards cached, fresh for up to `staleTime`, for whoever signed in next in the same tab.
 *
 * Deliberately does NOT navigate: the interceptor has no router, and emptying the auth store
 * already flips `ProtectedRoute`/`ConsultancyRoute` into their /login redirect on the next render.
 * Callers that want an immediate redirect (the button) navigate themselves.
 *
 * `reason` is given when the person did not choose to leave (review F-165): the login page then
 * says why, and the same person signing in again is taken back to the page they were on. Log out
 * passes none, which also forgets any earlier reason.
 *
 * Review F-294: the previous person's open chat window and their Course Finder choices (saved per
 * applicant in localStorage, so they outlive the tab's auth) go too, so nobody signing in next on a
 * shared desk inherits them. The queued analytics events are dropped by `lib/analytics.ts`, which
 * watches the same sign-out edge.
 */
export function endSession(reason?: SessionEndReason) {
  // Read before the cache is emptied: `GET /me`'s answer is the only place the user id lives.
  const me = queryClient.getQueryData<{ user?: { id?: string } }>(['me'])
  noteSessionEnded(reason, me?.user?.id ?? null)
  useAuthStore.getState().clear()
  queryClient.clear()
  useChatWindowStore.getState().close()
  clearCourseFinderCache()
}

/** The keys `features/clients/courseFinderState.ts` writes, one family per applicant. */
const COURSE_FINDER_KEY_PREFIX = 'course_finder_'

function clearCourseFinderCache() {
  try {
    // Collected first: removing while walking `localStorage.key(i)` would skip entries.
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(COURSE_FINDER_KEY_PREFIX)) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
  } catch {
    // Blocked storage has nothing to clear.
  }
}

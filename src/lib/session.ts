import { useAuthStore } from '@/stores/authStore'
import { queryClient } from '@/lib/queryClient'

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
 */
export function endSession() {
  useAuthStore.getState().clear()
  queryClient.clear()
}

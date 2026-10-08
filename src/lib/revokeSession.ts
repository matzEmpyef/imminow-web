import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'

/**
 * Tells the server the session is over, so its refresh token stops working (Log out and the idle
 * lock both use it). Fire-and-forget: a failed revocation must never trap someone in a session they
 * asked to leave. Call it BEFORE `endSession()`: the token is read explicitly because `clear()`
 * empties the store right after, before the request's own async chain could read it.
 */
export function revokeServerSession() {
  const token = useAuthStore.getState().accessToken
  if (token) {
    void api.POST('/auth/logout', { headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
  }
}

import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { endSession } from '@/lib/session'
import { useAuthStore } from '@/stores/authStore'

/**
 * The one way every shell's own "Sign out" control ends a session — extracted from SidebarShell
 * (2026-09-12) when FreelancerShell needed the identical action in its own slim top bar, rather
 * than growing a second hand-rolled copy. Revokes server-side (fire-and-forget: a failed
 * revocation must never trap someone in a session they asked to leave), tears the store + query
 * cache down via `endSession` (the same path the 401 interceptor uses), then redirects.
 *
 * The token is read explicitly rather than via the `useAuthStore` selector this hook could
 * otherwise use, because `clear()` runs synchronously right after — the request's own async chain
 * could otherwise read the store after it's already empty.
 */
export function useLogout() {
  const navigate = useNavigate()
  return function logout() {
    const token = useAuthStore.getState().accessToken
    if (token) {
      void api.POST('/auth/logout', { headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
    }
    endSession()
    navigate('/login')
  }
}

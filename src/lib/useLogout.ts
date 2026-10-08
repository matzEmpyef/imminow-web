import { useNavigate } from 'react-router-dom'
import { endSession } from '@/lib/session'
import { revokeServerSession } from '@/lib/revokeSession'

/**
 * The one way every shell's own "Sign out" control ends a session — extracted from SidebarShell
 * (2026-09-12) when FreelancerShell needed the identical action in its own slim top bar, rather
 * than growing a second hand-rolled copy. Revokes server-side (fire-and-forget: a failed
 * revocation must never trap someone in a session they asked to leave), tears the store + query
 * cache down via `endSession` (the same path the 401 interceptor uses), then redirects.
 */
export function useLogout() {
  const navigate = useNavigate()
  return function logout() {
    revokeServerSession()
    endSession()
    navigate('/login')
  }
}

import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { roleHomePath } from '@/lib/roleHome'

// H4 (frontend review, 1 Sep 2026) — `PlatformRoute` sends non-platform users away and
// `FreelancerRoute` sends non-freelancers away, but the inverse never existed: any authenticated
// role could mount /dashboard, /clients/*, /sales/*, /administration/* by URL. Wraps every
// consultancy-only route in App.tsx; `/account` and `/notifications` stay on the plain
// `ProtectedRoute` since every role legitimately reaches those two (see MyAccountPage/
// NotificationsPage's own role-aware shell picker, M12). Navigation only, same as the other two
// gates — the server enforces the real boundary.
export function ConsultancyRoute({ children }: { children: ReactNode }) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const role = useAuthStore((s) => s.user?.role)
  if (!isAuthed) return <Navigate to="/login" replace />
  if (role !== 'consultancy_admin' && role !== 'consultant') return <Navigate to={roleHomePath(role)} replace />
  return <>{children}</>
}

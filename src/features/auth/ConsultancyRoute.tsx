import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { SessionGate } from '@/features/auth/SessionGate'
import { scopeHomePath } from '@/lib/roleHome'
import { isStaffScope } from '@/lib/me'
import { PageNotFound } from '@/components/PageNotFound'

// H4 (frontend review, 1 Sep 2026) — `PlatformRoute` sends non-platform users away and
// `FreelancerRoute` sends non-freelancers away, but the inverse never existed: any authenticated
// role could mount /dashboard, /clients/*, /sales/*, /administration/* by URL. Wraps every
// consultancy-only route in App.tsx; `/account` and `/notifications` stay on the plain
// `ProtectedRoute` since every role legitimately reaches those two (see MyAccountPage/
// NotificationsPage's own shell picker, M12). Navigation only, same as the other two gates — the
// server enforces the real boundary.
//
// Decided from `GET /me`'s `scope` since review F-036: `consultancy`, or `institute` (a college's
// own account, which uses this same shell). Nothing renders until that answer is in (SessionGate).
export function ConsultancyRoute({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      {(me) => {
        if (isStaffScope(me.scope)) return children
        // A freelancer typing a staff address is told there is nothing there, not silently sent
        // home (T4-36).
        if (me.scope === 'freelancer') return <PageNotFound homePath={scopeHomePath(me.scope)} />
        return <Navigate to={scopeHomePath(me.scope)} replace />
      }}
    </SessionGate>
  )
}

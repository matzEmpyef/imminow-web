import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { SessionGate } from '@/features/auth/SessionGate'
import { scopeHomePath } from '@/lib/roleHome'

export function FreelancerRoute({ children }: { children: ReactNode }) {
  // H4 fix (1 Sep 2026): this used to hardcode `/dashboard`, which bounced a platform account
  // into the consultancy shell they can't use either — same bug PlatformRoute had in reverse.
  // Decided from `GET /me`'s `scope` since review F-036.
  return (
    <SessionGate>
      {(me) => (me.scope === 'freelancer' ? children : <Navigate to={scopeHomePath(me.scope)} replace />)}
    </SessionGate>
  )
}

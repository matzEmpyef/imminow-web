import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { roleHomePath } from '@/lib/roleHome'

export function FreelancerRoute({ children }: { children: ReactNode }) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const role = useAuthStore((s) => s.user?.role)
  if (!isAuthed) return <Navigate to="/login" replace />
  // H4 fix (1 Sep 2026): this used to hardcode `/dashboard`, which bounced a platform account
  // into the consultancy shell they can't use either — same bug PlatformRoute had in reverse.
  if (role !== 'freelancer') return <Navigate to={roleHomePath(role)} replace />
  return <>{children}</>
}

import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

export function FreelancerRoute({ children }: { children: ReactNode }) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const role = useAuthStore((s) => s.user?.role)
  if (!isAuthed) return <Navigate to="/login" replace />
  if (role !== 'freelancer') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

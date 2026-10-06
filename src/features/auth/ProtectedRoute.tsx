import type { ReactNode } from 'react'
import { SessionGate } from '@/features/auth/SessionGate'

/** Any signed-in account. Waits for `GET /me` like the three scoped guards (see SessionGate). */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  return <SessionGate>{() => children}</SessionGate>
}

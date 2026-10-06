import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { Button } from '@/components/Button'
import { useAuthStore } from '@/stores/authStore'
import { useLogout } from '@/lib/useLogout'
import { meBlockedError, useMe, type Me } from '@/queries/me'
import type { LoginLocationState } from '@/lib/sessionNotice'

/**
 * What every signed-in route waits behind (review F-036): the server's answer to "who am I"
 * (`GET /me`). The four route guards and the shells decide from that answer, so nothing may be
 * drawn before it is in hand — a shell picked from a guess is exactly the flash this prevents
 * (the consultancy menu shown to a platform account, "you don't have access" shown to someone
 * who has it).
 *
 *   not signed in      → the login page, which is told the address so a sign-in can come back
 *                        to it (review F-165)
 *   waiting            → a quiet loading card, no shell, no denial
 *   refused by /me     → the server's own message instead of a shell (a disabled account, or
 *                        staff of a consultancy whose subscription has lapsed), with Log out
 *   could not be read  → "Try again" and "Log out" (a network failure is never a blank page)
 *   answered           → the page, given the answer
 *
 * A failed BACKGROUND refresh keeps the previous answer on screen: a blip must not blank a
 * working page. The two refusals are the exception, since they are the server saying the answer
 * changed.
 */
export function SessionGate({ children }: { children: (me: Me) => ReactNode }) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const me = useMe()
  const logout = useLogout()
  const location = useLocation()

  if (!isAuthed) {
    const state: LoginLocationState = { from: `${location.pathname}${location.search}${location.hash}` }
    return <Navigate to="/login" replace state={state} />
  }

  const blocked = meBlockedError(me.error)
  if (blocked) {
    return (
      <AuthLayout title={blocked.code === 'account_disabled' ? 'Your account is switched off' : 'Your subscription has ended'}>
        <p role="alert" className="text-center text-body text-text-secondary">
          {blocked.message}
        </p>
        <Button variant="secondary" onClick={logout}>
          Log out
        </Button>
      </AuthLayout>
    )
  }

  if (me.data) return <>{children(me.data)}</>

  if (me.isError) {
    return (
      <AuthLayout title="We could not load your account">
        <p role="alert" className="text-center text-body text-text-secondary">
          Check your connection and try again.
        </p>
        <Button loading={me.isFetching} onClick={() => void me.refetch()}>
          Try again
        </Button>
        <Button variant="secondary" onClick={logout}>
          Log out
        </Button>
      </AuthLayout>
    )
  }

  return (
    <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center bg-background px-md">
      <div className="flex flex-col items-center gap-md">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden />
        <p className="text-body-sm text-text-secondary">Loading your account…</p>
      </div>
    </div>
  )
}

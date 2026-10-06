import { beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/lib/queryClient'
import { endSession } from '@/lib/session'
import { useAuthStore } from '@/stores/authStore'
import { noteSessionBegan, returnPathAfterSignIn, useSessionNoticeStore } from './sessionNotice'

// Review F-165: after a session ends on its own, the login page says why and the SAME person is
// taken back to the page they were on. Someone else signing in at that desk starts at home.
beforeEach(() => {
  useSessionNoticeStore.setState({ notice: null, returnBlocked: false })
  useAuthStore.getState().clear()
  queryClient.clear()
})

function endSessionOf(userId: string, reason: 'expired' | 'idle' | 'absolute' = 'expired') {
  useAuthStore.getState().setSession({ access_token: 'a', refresh_token: 'r' })
  queryClient.setQueryData(['me'], { user: { id: userId } })
  endSession(reason)
}

describe('why a session ended', () => {
  it('is kept with whose session it was', () => {
    endSessionOf('u1', 'idle')
    expect(useSessionNoticeStore.getState().notice).toEqual({ reason: 'idle', userId: 'u1' })
  })

  it('is not kept when the person logged out themselves, and an earlier one is forgotten', () => {
    endSessionOf('u1')
    useAuthStore.getState().setSession({ access_token: 'a', refresh_token: 'r' })
    endSession()
    expect(useSessionNoticeStore.getState().notice).toBeNull()
  })

  it('is cleared by the next sign-in', () => {
    endSessionOf('u1')
    noteSessionBegan('u1')
    expect(useSessionNoticeStore.getState().notice).toBeNull()
  })
})

describe('where a sign-in lands', () => {
  it('returns the same person to the page their session ended on', () => {
    endSessionOf('u1')
    noteSessionBegan('u1')
    expect(returnPathAfterSignIn('/clients/c1?tab=applications')).toBe('/clients/c1?tab=applications')
  })

  it('sends a different person home instead', () => {
    endSessionOf('u1')
    noteSessionBegan('u2')
    expect(returnPathAfterSignIn('/clients/c1')).toBeNull()
  })

  it('honours an address opened while signed out when no session ended here', () => {
    noteSessionBegan('u2')
    expect(returnPathAfterSignIn('/admin/finance')).toBe('/admin/finance')
  })

  it.each([undefined, null, 42, '', 'https://elsewhere.test/x', '//elsewhere.test/x', '/login', '/login?x=1'])(
    'ignores %o: only an address inside the console, and never the login page',
    (from) => {
      expect(returnPathAfterSignIn(from)).toBeNull()
    },
  )
})

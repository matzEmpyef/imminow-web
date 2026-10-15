import { beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/lib/queryClient'
import { endSession } from '@/lib/session'
import { useAuthStore } from '@/stores/authStore'
import { noteSessionBegan, useSessionNoticeStore } from './sessionNotice'

// Review F-165: after a session ends on its own, the login page says why. Signing in again always
// starts at the person's own dashboard (owner's decision 151), so nothing here decides a return page.
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
    noteSessionBegan()
    expect(useSessionNoticeStore.getState().notice).toBeNull()
  })
})

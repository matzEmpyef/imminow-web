import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/lib/queryClient'
import { endSession } from '@/lib/session'
import { useAuthStore } from '@/stores/authStore'
import {
  LINK_MAX_AGE_MS,
  RETURN_PAGE_MAX_AGE_MS,
  landingPathAfterSignIn,
  noteSessionBegan,
  useSessionNoticeStore,
} from './sessionNotice'

// Review F-165: after a session ends on its own, the login page says why. Owner's decision 151 (as
// amended): a person goes to the link they opened while signed out, or back to the page their own
// session ended on, or else to their own dashboard.
beforeEach(() => {
  useSessionNoticeStore.setState({ notice: null, returnPage: null, resumePage: null })
  window.history.pushState({}, '', '/')
  useAuthStore.getState().clear()
  queryClient.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

function endSessionOf(userId: string, reason: 'expired' | 'idle' | 'absolute' = 'expired', page = '/clients/c1?tab=applications') {
  window.history.pushState({}, '', page)
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

describe('where a sign-in lands', () => {
  const now = () => Date.now()

  it('(a) follows a link opened while signed out, when the guard sent them just now', () => {
    noteSessionBegan('u1')
    expect(landingPathAfterSignIn({ role: 'consultant', from: '/clients/c9', at: now() })).toBe('/clients/c9')
  })

  it('does not follow a link the guard left more than 30 minutes ago', () => {
    noteSessionBegan('u1')
    expect(landingPathAfterSignIn({ role: 'consultant', from: '/clients/c9', at: now() - LINK_MAX_AGE_MS - 1000 })).toBe('/dashboard')
    expect(landingPathAfterSignIn({ role: 'consultant', from: '/clients/c9' })).toBe('/dashboard')
  })

  it('(b) takes the same person back to the page their session ended on', () => {
    endSessionOf('u1', 'idle')
    noteSessionBegan('u1')
    expect(landingPathAfterSignIn({ role: 'consultant' })).toBe('/clients/c1?tab=applications')
  })

  it('(c) sends a different person to their own dashboard, and forgets the first person’s page', () => {
    endSessionOf('u1', 'idle')
    noteSessionBegan('u2')
    expect(landingPathAfterSignIn({ role: 'consultant' })).toBe('/dashboard')
    // The page is gone for good: u1 signing in afterwards does not get it back.
    noteSessionBegan('u1')
    expect(landingPathAfterSignIn({ role: 'consultant' })).toBe('/dashboard')
  })

  it('(d) drops a page older than 12 hours', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-14T08:00:00Z'))
    endSessionOf('u1', 'idle')
    vi.setSystemTime(Date.now() + RETURN_PAGE_MAX_AGE_MS + 60_000)
    noteSessionBegan('u1')
    expect(landingPathAfterSignIn({ role: 'consultant' })).toBe('/dashboard')
  })

  it('(e) never sends a person to a page their role cannot open', () => {
    endSessionOf('u1', 'idle', '/admin/finance')
    noteSessionBegan('u1')
    expect(landingPathAfterSignIn({ role: 'consultant' })).toBe('/dashboard')
    expect(landingPathAfterSignIn({ role: 'freelancer', from: '/admin/needs-attention', at: now() })).toBe('/freelancer/dashboard')
    expect(landingPathAfterSignIn({ role: 'platform_staff', from: '/clients/c1', at: now() })).toBe('/admin/dashboard')
    expect(landingPathAfterSignIn({ role: 'student', from: '/clients/c1', at: now() })).toBe('/account')
  })

  it('uses a kept page once', () => {
    endSessionOf('u1', 'idle')
    noteSessionBegan('u1')
    expect(landingPathAfterSignIn({ role: 'consultant' })).toBe('/clients/c1?tab=applications')
    expect(landingPathAfterSignIn({ role: 'consultant' })).toBe('/dashboard')
  })

  it('keeps no page after the person logged out themselves', () => {
    endSessionOf('u1', 'idle')
    useAuthStore.getState().setSession({ access_token: 'a', refresh_token: 'r' })
    endSession()
    noteSessionBegan('u1')
    expect(landingPathAfterSignIn({ role: 'consultant' })).toBe('/dashboard')
  })

  it.each(['/', '/login', '/login?x=1', '//elsewhere.test/x', 'https://elsewhere.test/x', '/set-password/abc', '/\\elsewhere.test/x', '/clients\\..\\x'])(
    'never follows %o',
    (page) => {
      if (page.startsWith('/') && !page.startsWith('//')) endSessionOf('u1', 'expired', page)
      noteSessionBegan('u1')
      expect(landingPathAfterSignIn({ role: 'consultant', from: page, at: Date.now() })).toBe('/dashboard')
    },
  )
})

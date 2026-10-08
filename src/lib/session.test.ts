import { describe, expect, it } from 'vitest'
import { useAuthStore } from '@/stores/authStore'
import { queryClient } from '@/lib/queryClient'
import { useChatWindowStore } from '@/stores/chatWindowStore'
import { endSession } from './session'

// The one way a session ends. Both exits (Log out, and the 401 interceptor giving up) go through
// here so the next account in the same tab never sees the previous account's cached lists.
describe('endSession', () => {
  it('clears the auth store and empties the React Query cache together', () => {
    useAuthStore.getState().setSession({ access_token: 'a', refresh_token: 'r' })
    queryClient.setQueryData(['clients'], { items: [{ id: 'c1' }] })
    // Who the caller is lives in the query cache too (`GET /me`), so it goes with everything else.
    queryClient.setQueryData(['me'], { user: { id: 'u1' }, scope: 'platform', staff: null })
    expect(useAuthStore.getState().accessToken).toBe('a')
    expect(queryClient.getQueryData(['clients'])).toBeDefined()

    endSession()

    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.refreshToken).toBeNull()
    expect(queryClient.getQueryData(['me'])).toBeUndefined()
    expect(queryClient.getQueryData(['clients'])).toBeUndefined()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('also wipes the persisted copy so a reload cannot resurrect the session', () => {
    useAuthStore.getState().setSession({ access_token: 'a', refresh_token: 'r' })
    expect(sessionStorage.getItem('imminow-auth')).toContain('"accessToken":"a"')
    endSession()
    expect(sessionStorage.getItem('imminow-auth') ?? '').not.toContain('"accessToken":"a"')
  })

  // Review F-294: a shared desk's next person must not inherit the last one's open chat or their
  // Course Finder choices, but unrelated saved keys stay.
  it('closes the open chat window and forgets the Course Finder choices', () => {
    useChatWindowStore.getState().open({ id: 'c1', type: 'client', name: 'Asha' })
    localStorage.setItem('course_finder_last_client', 'p1:client')
    localStorage.setItem('course_finder_state:p1', '{}')
    localStorage.setItem('course_finder_shortlist:p1', '[]')
    localStorage.setItem('unrelated', 'keep')

    endSession()

    expect(useChatWindowStore.getState().conversation).toBeNull()
    expect(localStorage.getItem('course_finder_last_client')).toBeNull()
    expect(localStorage.getItem('course_finder_state:p1')).toBeNull()
    expect(localStorage.getItem('course_finder_shortlist:p1')).toBeNull()
    expect(localStorage.getItem('unrelated')).toBe('keep')
  })
})

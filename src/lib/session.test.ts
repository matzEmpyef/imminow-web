import { describe, expect, it } from 'vitest'
import { useAuthStore } from '@/stores/authStore'
import { queryClient } from '@/lib/queryClient'
import { endSession } from './session'

// The one way a session ends. Both exits (Log out, and the 401 interceptor giving up) go through
// here so the next account in the same tab never sees the previous account's cached lists.
describe('endSession', () => {
  it('clears the auth store and empties the React Query cache together', () => {
    useAuthStore.getState().setSession({
      access_token: 'a',
      refresh_token: 'r',
      user: { id: 'u1', email: 'x@y.z', first_name: 'A', last_name: 'B', role: 'super_admin' } as never,
    })
    queryClient.setQueryData(['clients'], { items: [{ id: 'c1' }] })
    expect(useAuthStore.getState().accessToken).toBe('a')
    expect(queryClient.getQueryData(['clients'])).toBeDefined()

    endSession()

    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.refreshToken).toBeNull()
    expect(state.user).toBeNull()
    expect(queryClient.getQueryData(['clients'])).toBeUndefined()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('also wipes the persisted copy so a reload cannot resurrect the session', () => {
    useAuthStore.getState().setSession({ access_token: 'a', refresh_token: 'r', user: { id: 'u1' } as never })
    expect(sessionStorage.getItem('imminow-auth')).toContain('"accessToken":"a"')
    endSession()
    expect(sessionStorage.getItem('imminow-auth') ?? '').not.toContain('"accessToken":"a"')
  })
})

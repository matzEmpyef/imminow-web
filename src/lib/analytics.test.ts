import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-317: nothing is recorded while signed out, the last send (tab going away) is made with
// `keepalive`, and a session ending drops what was queued for it.
vi.mock('@/api/client', () => ({ api: { POST: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { startAnalytics, track } from './analytics'

const mockedPost = vi.mocked(api.POST)

function hideTab() {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeAll(() => startAnalytics())

beforeEach(() => {
  mockedPost.mockReset()
  mockedPost.mockResolvedValue({ data: undefined, error: undefined, response: { status: 202 } } as never)
  useAuthStore.getState().clear()
})

describe('analytics', () => {
  it('records nothing while signed out', () => {
    track('screen_viewed')
    hideTab()
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('sends what was recorded when the tab is hidden, with keepalive', () => {
    useAuthStore.getState().setSession({ access_token: 'a', refresh_token: 'r' })
    track('screen_viewed', { properties: { module: 'clients' } })
    hideTab()
    expect(mockedPost).toHaveBeenCalledTimes(1)
    const [path, init] = mockedPost.mock.calls[0] as unknown as [string, { keepalive?: boolean; body: { events: unknown[] } }]
    expect(path).toBe('/analytics/events')
    expect(init.keepalive).toBe(true)
    expect(init.body.events).toHaveLength(1)
  })

  it('drops the queue when the session ends, so the next person does not send it', () => {
    useAuthStore.getState().setSession({ access_token: 'a', refresh_token: 'r' })
    track('screen_viewed')
    useAuthStore.getState().clear()
    useAuthStore.getState().setSession({ access_token: 'b', refresh_token: 'r2' })
    hideTab()
    expect(mockedPost).not.toHaveBeenCalled()
  })
})

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// `requestNewAccessToken` stands in for "a normal authenticated call the server records activity
// from" (see idleLockManager.ts's doc comment on `refreshSession`); `api.POST` is realtime's own
// ticket call, stubbed to the mock-server's actual "disabled" shape so `startRealtime()` doesn't
// need a real socket to exercise its stop() path.
vi.mock('@/api/client', () => ({
  api: {
    POST: vi.fn(async () => ({
      data: undefined,
      error: { error: { code: 'realtime_disabled', message: 'off', request_id: 'r1' } },
      response: { status: 503 },
    })),
  },
  requestNewAccessToken: vi.fn(async () => 'new-access-token'),
}))

import { requestNewAccessToken } from '@/api/client'
import { queryClient } from '@/lib/queryClient'
import { realtimeManager, startRealtime } from '@/lib/realtime'
import { useToastStore } from '@/lib/toast'
import { useAuthStore } from '@/stores/authStore'
import { idleLockManager, startIdleLock } from './bootstrap'
import { ABSOLUTE_CAP_MS, IDLE_LOCK_MS, IDLE_WARNING_MS } from './idleLockManager'
import { useIdleLockStore } from './store'

function signIn(refreshToken = 'r1') {
  useAuthStore.getState().setSession({
    access_token: 'a1',
    refresh_token: refreshToken,
    user: { id: 'u1', email: 'x@y.z', first_name: 'A', last_name: 'B', role: 'consultancy_admin' } as never,
  })
}

// Both wired ONCE for the whole file, the way `main.tsx` wires them once for the app — each
// registers a permanent `authStore` subscription, so calling them per-test would stack subscribers
// pointlessly (each carrying its own stale `wasSignedIn`). Every test instead starts from a clean
// signed-out state and drives the real sign-in/sign-out edges those subscriptions react to.
describe('idle lock bootstrap', () => {
  beforeAll(() => {
    startRealtime()
    startIdleLock()
  })

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useAuthStore.getState().clear()
    queryClient.clear()
    useToastStore.setState({ toasts: [] })
    useIdleLockStore.setState({ warning: false, secondsRemaining: 0 })
    vi.mocked(requestNewAccessToken).mockClear()
  })

  afterEach(() => {
    useAuthStore.getState().clear() // drives both managers' own subscriptions back to "stopped"
    vi.useRealTimers()
  })

  it('signs out cleanly, stops realtime, and shows the 30-minute explanation', () => {
    signIn()
    expect(useAuthStore.getState().accessToken).toBe('a1')

    vi.advanceTimersByTime(IDLE_LOCK_MS)

    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().refreshToken).toBeNull()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(realtimeManager.getStatus()).toBe('stopped')
    const lastToast = useToastStore.getState().toasts.at(-1)
    expect(lastToast?.tone).toBe('info')
    expect(lastToast?.message).toBe('You were signed out after 30 minutes without activity.')
  })

  it('signs out after 12 hours regardless of activity, with its own explanation', () => {
    signIn()

    // Keep activity flowing every 5 minutes so the 30-minute idle lock never fires on its own —
    // only the absolute cap should end this session.
    for (let elapsed = 0; elapsed < ABSOLUTE_CAP_MS; elapsed += 5 * 60 * 1000) {
      document.dispatchEvent(new KeyboardEvent('keydown'))
      vi.advanceTimersByTime(5 * 60 * 1000)
    }

    expect(useAuthStore.getState().accessToken).toBeNull()
    const lastToast = useToastStore.getState().toasts.at(-1)
    expect(lastToast?.message).toBe('You were signed out after 12 hours for security. Please sign in again.')
  })

  it('"Stay signed in" calls the same refresh the 401 interceptor uses, without locking', () => {
    signIn()

    vi.advanceTimersByTime(IDLE_WARNING_MS + 30_000)
    expect(useIdleLockStore.getState().warning).toBe(true)

    idleLockManager.staySignedIn()

    expect(requestNewAccessToken).toHaveBeenCalledTimes(1)
    expect(useIdleLockStore.getState().warning).toBe(false)
    expect(useAuthStore.getState().accessToken).toBe('a1')
  })

  it('a returning user is not signed out by the clock their previous session left behind', () => {
    // Yesterday: signed in, worked, closed the browser — no sign-out ever ran.
    signIn('v1.session-yesterday.idp-token')
    vi.advanceTimersByTime(60_000)
    const left = Object.entries(localStorage)
    expect(left).toHaveLength(2)
    // Simulate the closed tab: the auth store empties WITHOUT the manager's stop() tidying up.
    useAuthStore.getState().clear()
    for (const [key, value] of left) localStorage.setItem(key, value)

    vi.advanceTimersByTime(20 * 60 * 60 * 1000)
    signIn('v1.session-today.idp-token')
    vi.advanceTimersByTime(5000)

    expect(useAuthStore.getState().accessToken).toBe('a1')
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('does not run the idle clock at all while signed out', () => {
    // Never sign in.
    vi.advanceTimersByTime(IDLE_LOCK_MS)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})

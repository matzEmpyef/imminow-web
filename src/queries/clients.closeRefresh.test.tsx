import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// T1-10 / T4-13: the Commissions tab kept the old figures after a case was closed, because the
// server settles the commission just after the close commits. Closing now reads the tab's data
// again a little later, twice, on top of the read made at once.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('./standing', () => ({ refreshStanding: vi.fn() }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { COMMISSION_REFRESH_DELAYS_MS, useCloseClient } from './clients'

beforeEach(() => {
  vi.useFakeTimers()
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(api.POST).mockResolvedValue({ data: { id: 'c1' }, error: undefined } as never)
})
afterEach(() => vi.useRealTimers())

describe('closing a case refreshes its Commissions tab', () => {
  it('invalidates the tab at once and again after the server has settled the entry', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useCloseClient(), { wrapper })

    await act(async () => {
      result.current.mutate({ id: 'c1', reason: 'visa_refused' })
    })
    const commissionCalls = () =>
      invalidate.mock.calls.filter(([filters]) => JSON.stringify(filters?.queryKey) === '["clients","c1","commissions"]')
    // The immediate read is the broad ['clients', id] one; the dedicated ones come later.
    expect(commissionCalls()).toHaveLength(0)

    for (const [i, delay] of COMMISSION_REFRESH_DELAYS_MS.entries()) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(i === 0 ? delay : delay - COMMISSION_REFRESH_DELAYS_MS[i - 1])
      })
      expect(commissionCalls()).toHaveLength(i + 1)
    }
  })
})

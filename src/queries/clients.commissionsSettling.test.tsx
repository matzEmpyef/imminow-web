import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// T1-10: the server settles a closed case's commission in a step of its own and says so with
// `settling`. The Commissions tab reads again until that is false, instead of at fixed times.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { COMMISSION_SETTLING_CAP_MS, COMMISSION_SETTLING_POLL_MS, useCommissions } from './clients'

const summary = (settling: boolean) => ({ data: { settling, entry: null, installments: [] }, error: undefined })
const reads = () => vi.mocked(api.GET).mock.calls.length

beforeEach(() => {
  vi.useFakeTimers()
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(api.GET).mockReset()
})
afterEach(() => vi.useRealTimers())

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useCommissions('c1'), { wrapper })
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

describe('the Commissions tab while the server is settling a closed case', () => {
  it('reads again every few seconds while settling, and stops the moment it is false', async () => {
    vi.mocked(api.GET)
      .mockResolvedValueOnce(summary(true) as never)
      .mockResolvedValueOnce(summary(true) as never)
      .mockResolvedValue(summary(false) as never)
    setup()
    await advance(0)
    expect(reads()).toBe(1)
    await advance(COMMISSION_SETTLING_POLL_MS)
    expect(reads()).toBe(2)
    await advance(COMMISSION_SETTLING_POLL_MS)
    expect(reads()).toBe(3)
    // Settled: no further reads, however long it waits.
    await advance(COMMISSION_SETTLING_POLL_MS * 10)
    expect(reads()).toBe(3)
  })

  it('never polls a case that is not settling', async () => {
    vi.mocked(api.GET).mockResolvedValue(summary(false) as never)
    setup()
    await advance(COMMISSION_SETTLING_POLL_MS * 5)
    expect(reads()).toBe(1)
  })

  it('gives up after a sensible cap if the server keeps saying settling', async () => {
    vi.mocked(api.GET).mockResolvedValue(summary(true) as never)
    setup()
    await advance(COMMISSION_SETTLING_CAP_MS + COMMISSION_SETTLING_POLL_MS * 3)
    const atCap = reads()
    expect(atCap).toBeGreaterThan(5)
    expect(atCap).toBeLessThanOrEqual(COMMISSION_SETTLING_CAP_MS / COMMISSION_SETTLING_POLL_MS + 3)
    await advance(COMMISSION_SETTLING_CAP_MS)
    expect(reads()).toBe(atCap)
  })
})

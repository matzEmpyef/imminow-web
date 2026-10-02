import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// A fresh send sits at `queued` until the worker flips it to `sent`; the Send History table has to
// follow along without a page refresh, but must not poll once every row is final.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { BROADCAST_POLL_MS, hasPendingBroadcast, useBroadcastHistory } from './broadcast'

const mockedGet = vi.mocked(api.GET)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function rows(...statuses: string[]) {
  return {
    data: { items: statuses.map((status, i) => ({ id: `b${i}`, status })), meta: { next_cursor: null, total: statuses.length } },
    error: undefined,
  } as never
}

beforeEach(() => {
  mockedGet.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('hasPendingBroadcast', () => {
  it('is true only while a row is queued or sending', () => {
    expect(hasPendingBroadcast([{ status: 'sent' }, { status: 'queued' }])).toBe(true)
    expect(hasPendingBroadcast([{ status: 'sending' }])).toBe(true)
    expect(hasPendingBroadcast([{ status: 'sent' }, { status: 'failed' }])).toBe(false)
    expect(hasPendingBroadcast([])).toBe(false)
    expect(hasPendingBroadcast(undefined)).toBe(false)
  })
})

describe('useBroadcastHistory polling', () => {
  it('polls while a row is queued and stops once every row is sent', async () => {
    mockedGet.mockResolvedValueOnce(rows('queued'))
    mockedGet.mockResolvedValue(rows('sent'))
    const { result } = renderHook(() => useBroadcastHistory({}), { wrapper })

    await waitFor(() => expect(result.current.data?.items[0].status).toBe('queued'))
    expect(mockedGet).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(result.current.data?.items[0].status).toBe('sent'), { timeout: BROADCAST_POLL_MS + 2000 })
    expect(mockedGet).toHaveBeenCalledTimes(2)

    // All final now: no further requests across another full interval.
    await new Promise((r) => setTimeout(r, BROADCAST_POLL_MS + 500))
    expect(mockedGet).toHaveBeenCalledTimes(2)
  }, 15000)

  it('never polls when nothing is pending', async () => {
    mockedGet.mockResolvedValue(rows('sent', 'failed'))
    const { result } = renderHook(() => useBroadcastHistory({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await new Promise((r) => setTimeout(r, BROADCAST_POLL_MS + 500))
    expect(mockedGet).toHaveBeenCalledTimes(1)
  }, 10000)
})

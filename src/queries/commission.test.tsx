import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// Commission Details (contract gate 11): `GET /commission` pages dues by `cursor` and the payment
// history by its own `history_cursor`. The two chains must reach the server independently, and a
// cursor change must be a different cache entry — while `['commission']` stays the prefix every
// payment mutation invalidates.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useCommission } from './commission'

const mockedGet = vi.mocked(api.GET)

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return { client, wrapper }
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedGet.mockResolvedValue({
    data: { dues: [], payment_history: [], running_total: 0, currency: 'INR' },
    error: undefined,
  } as never)
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('useCommission', () => {
  it('asks for the first page of both chains with no cursors', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useCommission(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedGet).toHaveBeenCalledWith(
      '/commission',
      expect.objectContaining({
        params: { query: { cursor: undefined, history_cursor: undefined } },
      }),
    )
  })

  it('sends the dues cursor and the history cursor independently', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useCommission({ cursor: 'dues-2', historyCursor: 'hist-3' }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedGet).toHaveBeenCalledWith(
      '/commission',
      expect.objectContaining({
        params: { query: { cursor: 'dues-2', history_cursor: 'hist-3' } },
      }),
    )
  })

  it('keeps each cursor combination under the invalidated [commission] prefix', async () => {
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useCommission({ cursor: 'dues-2' }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getQueryCache().findAll({ queryKey: ['commission'] })).toHaveLength(1)
  })
})

import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// Global Chat Drawer paging + search (contract gate 7, owner Q6 2026-09-25): pages of 20, more
// loaded as the drawer scrolls, search narrowed server-side. `useConversationsList` is the
// `useInfiniteQuery` behind that — these pin the cursor/search wiring a scroll-simulation test on
// the drawer itself can't see directly.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useConversationsList } from './conversations'

const mockedGet = vi.mocked(api.GET)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function page(items: { id: string }[], nextCursor: string | null) {
  return { data: { items, meta: { next_cursor: nextCursor, total: 99, unread_count: 3 } }, error: undefined } as never
}

beforeEach(() => {
  mockedGet.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('useConversationsList', () => {
  it('fetches the first page with the search term and limit 20, and does nothing when disabled', async () => {
    mockedGet.mockResolvedValue(page([{ id: 'c1' }], null))
    const { result } = renderHook(() => useConversationsList('priya', { enabled: true }), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedGet).toHaveBeenCalledWith(
      '/conversations',
      expect.objectContaining({
        params: { query: expect.objectContaining({ cursor: undefined, limit: 20, search: 'priya' }) },
      }),
    )
  })

  it('walks next_cursor and accumulates pages on fetchNextPage', async () => {
    // Keyed on the cursor actually sent, not call order — robust to an extra background refetch.
    mockedGet.mockImplementation(async (_path: unknown, opts: unknown) => {
      const cursor = (opts as { params: { query: { cursor?: string } } }).params.query.cursor
      if (!cursor) return page([{ id: 'c1' }, { id: 'c2' }], 'cursor-2')
      if (cursor === 'cursor-2') return page([{ id: 'c3' }], null)
      throw new Error(`unexpected cursor ${cursor}`)
    })
    const { result } = renderHook(() => useConversationsList('', { enabled: true }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.hasNextPage).toBe(true)

    await act(async () => {
      await result.current.fetchNextPage()
    })

    await waitFor(() => expect(result.current.data?.pages.length).toBe(2))
    expect(mockedGet).toHaveBeenLastCalledWith(
      '/conversations',
      expect.objectContaining({ params: { query: expect.objectContaining({ cursor: 'cursor-2' }) } }),
    )
    expect(result.current.data?.pages.flatMap((p) => p.items)).toEqual([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }])
    expect(result.current.hasNextPage).toBe(false)
  })

  it('disabled (drawer closed) never fetches', () => {
    renderHook(() => useConversationsList('', { enabled: false }), { wrapper })
    expect(mockedGet).not.toHaveBeenCalled()
  })
})

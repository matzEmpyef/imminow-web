import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// Client Profile's Internal Notes tab (contract gate 7, reordered 2026-09-26 by the coordinator:
// `GET /clients/{id}/notes` now pages NEWEST first, `created_at` desc, so the newest notes and one
// just added are always on the first page). `useInternalNotes` moved from a plain `useQuery` +
// Previous/Next to `useInfiniteQuery`, same shape as the Global Chat Drawer's
// `useConversationsList` — these pin its cursor wiring and the add-note cache surgery that lets a
// new note appear without a refetch.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useAddInternalNote, useInternalNotes } from './clients'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function page(items: { id: string; created_at: string }[], nextCursor: string | null, total = items.length) {
  return { data: { items, meta: { next_cursor: nextCursor, total } }, error: undefined } as never
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('useInternalNotes', () => {
  it('fetches the first page with no cursor and limit 20', async () => {
    mockedGet.mockResolvedValue(page([{ id: 'n1', created_at: '2026-09-26T10:00:00Z' }], null))
    const { result } = renderHook(() => useInternalNotes('client-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedGet).toHaveBeenCalledWith(
      '/clients/{id}/notes',
      expect.objectContaining({
        params: { path: { id: 'client-1' }, query: { limit: 20, cursor: undefined } },
      }),
    )
    expect(result.current.hasNextPage).toBe(false)
  })

  it('walks next_cursor toward older notes on fetchNextPage, keeping fetch order', async () => {
    mockedGet.mockImplementation(async (_path: unknown, opts: unknown) => {
      const cursor = (opts as { params: { query: { cursor?: string } } }).params.query.cursor
      if (!cursor) return page([{ id: 'newest', created_at: '2026-09-26T12:00:00Z' }], 'older-cursor')
      if (cursor === 'older-cursor') return page([{ id: 'oldest', created_at: '2026-09-26T09:00:00Z' }], null)
      throw new Error(`unexpected cursor ${cursor}`)
    })
    const { result } = renderHook(() => useInternalNotes('client-1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.hasNextPage).toBe(true)

    await act(async () => {
      await result.current.fetchNextPage()
    })

    await waitFor(() => expect(result.current.data?.pages.length).toBe(2))
    expect(mockedGet).toHaveBeenLastCalledWith(
      '/clients/{id}/notes',
      expect.objectContaining({ params: expect.objectContaining({ query: expect.objectContaining({ cursor: 'older-cursor' }) }) }),
    )
    // pages[0] stays the newest page fetched first; the older page is appended after it.
    expect(result.current.data?.pages.map((p) => p.items[0].id)).toEqual(['newest', 'oldest'])
    expect(result.current.hasNextPage).toBe(false)
  })

  it('disabled with no client id never fetches', () => {
    renderHook(() => useInternalNotes(undefined), { wrapper })
    expect(mockedGet).not.toHaveBeenCalled()
  })
})

describe('useAddInternalNote', () => {
  it('prepends the new note into pages[0] and bumps total, without touching later pages', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['clients', 'client-1', 'notes'], {
      pages: [
        { items: [{ id: 'n2', content: 'second' }], meta: { next_cursor: 'c2', total: 2 } },
        { items: [{ id: 'n1', content: 'first' }], meta: { next_cursor: null, total: 2 } },
      ],
      pageParams: [undefined, 'c2'],
    })
    function localWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }
    mockedPost.mockResolvedValue({ data: { id: 'n3', content: 'brand new' }, error: undefined } as never)

    const { result } = renderHook(() => useAddInternalNote('client-1'), { wrapper: localWrapper })
    await act(async () => {
      await result.current.mutateAsync('brand new')
    })

    const cached = client.getQueryData(['clients', 'client-1', 'notes']) as {
      pages: { items: { id: string }[]; meta: { total: number | null } }[]
    }
    expect(cached.pages[0].items.map((n) => n.id)).toEqual(['n3', 'n2'])
    expect(cached.pages[0].meta.total).toBe(3)
    // The older, already-loaded page is untouched.
    expect(cached.pages[1].items.map((n) => n.id)).toEqual(['n1'])
  })

  it('does nothing to the cache when no page has been loaded yet', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function localWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }
    mockedPost.mockResolvedValue({ data: { id: 'n1', content: 'first' }, error: undefined } as never)

    const { result } = renderHook(() => useAddInternalNote('client-1'), { wrapper: localWrapper })
    await act(async () => {
      await result.current.mutateAsync('first')
    })

    expect(client.getQueryData(['clients', 'client-1', 'notes'])).toBeUndefined()
  })
})

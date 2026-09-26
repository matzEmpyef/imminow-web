import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// Lead Conversation's Notes card (contract gate 7, reordered 2026-09-26 by the coordinator:
// `GET /leads/{id}/notes` now pages NEWEST first, same as Client Profile's Internal Notes tab).
// Mirrors clients.notes.test.tsx — the two panels share the exact same hook shape and cache
// surgery so they can never drift into different ordering.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useAddLeadNote, useLeadNotes } from './leads'

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

describe('useLeadNotes', () => {
  it('fetches the first page with no cursor and limit 20', async () => {
    mockedGet.mockResolvedValue(page([{ id: 'n1', created_at: '2026-09-26T10:00:00Z' }], null))
    const { result } = renderHook(() => useLeadNotes('lead-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedGet).toHaveBeenCalledWith(
      '/leads/{id}/notes',
      expect.objectContaining({
        params: { path: { id: 'lead-1' }, query: { limit: 20, cursor: undefined } },
      }),
    )
    expect(result.current.hasNextPage).toBe(false)
  })

  it('walks next_cursor toward older notes on fetchNextPage', async () => {
    mockedGet.mockImplementation(async (_path: unknown, opts: unknown) => {
      const cursor = (opts as { params: { query: { cursor?: string } } }).params.query.cursor
      if (!cursor) return page([{ id: 'newest', created_at: '2026-09-26T12:00:00Z' }], 'older-cursor')
      if (cursor === 'older-cursor') return page([{ id: 'oldest', created_at: '2026-09-26T09:00:00Z' }], null)
      throw new Error(`unexpected cursor ${cursor}`)
    })
    const { result } = renderHook(() => useLeadNotes('lead-1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.hasNextPage).toBe(true)

    await act(async () => {
      await result.current.fetchNextPage()
    })

    await waitFor(() => expect(result.current.data?.pages.length).toBe(2))
    expect(result.current.data?.pages.map((p) => p.items[0].id)).toEqual(['newest', 'oldest'])
    expect(result.current.hasNextPage).toBe(false)
  })

  it('disabled with no lead id never fetches', () => {
    renderHook(() => useLeadNotes(undefined), { wrapper })
    expect(mockedGet).not.toHaveBeenCalled()
  })
})

describe('useAddLeadNote', () => {
  it('prepends the new note into pages[0] and bumps total', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['leads', 'lead-1', 'notes'], {
      pages: [{ items: [{ id: 'n1', content: 'first' }], meta: { next_cursor: null, total: 1 } }],
      pageParams: [undefined],
    })
    function localWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }
    mockedPost.mockResolvedValue({ data: { id: 'n2', content: 'second' }, error: undefined } as never)

    const { result } = renderHook(() => useAddLeadNote('lead-1'), { wrapper: localWrapper })
    await act(async () => {
      await result.current.mutateAsync('second')
    })

    const cached = client.getQueryData(['leads', 'lead-1', 'notes']) as {
      pages: { items: { id: string }[]; meta: { total: number | null } }[]
    }
    expect(cached.pages[0].items.map((n) => n.id)).toEqual(['n2', 'n1'])
    expect(cached.pages[0].meta.total).toBe(2)
  })
})

import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import { useAuthStore } from '@/stores/authStore'
import { useServerSearch, type ServerSearchSource } from './useServerSearch'

// A list whose page links are sealed (`GET /consultancies`): a link the server refuses (400
// `validation_failed` naming `cursor`) is not an error for the picker, the list is read again from
// its first page. Every link goes back exactly as it was received.
interface Row {
  id: string
  name: string
}
const SEALED = 'eyJ2IjoxfQ==.a+b/c=.9f2e'
const staleLink = () =>
  new ApiError(
    'Could not load.',
    {
      error: {
        code: 'validation_failed',
        message: 'That page link can no longer be used. Start again from the first page.',
        details: { fields: { cursor: 'That page link can no longer be used.' } },
      },
    },
    400,
  )

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('useServerSearch with a refused page link', () => {
  it('reads the list again from the first page and shows no error', async () => {
    const asked: (string | undefined)[] = []
    const source: ServerSearchSource<Row> = {
      queryKey: ['picker', 'sealed'],
      fetchPage: vi.fn(async ({ cursor }) => {
        asked.push(cursor)
        if (cursor === SEALED) throw staleLink()
        return { items: [{ id: 'a', name: 'Acadia' }], nextCursor: SEALED }
      }),
      toOption: (r) => ({ id: r.id, label: r.name }),
    }
    const { result } = renderHook(() => useServerSearch(source, ''), { wrapper })
    await waitFor(() => expect(result.current.entries).toHaveLength(1))

    act(() => result.current.loadMore())

    await waitFor(() => expect(asked).toContain(SEALED))
    // The first page is read again (no cursor), and the picker never reports a failure.
    await waitFor(() => expect(asked.filter((c) => c === undefined)).toHaveLength(2))
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    expect(result.current.isError).toBe(false)
  })

  it('still reports any other failure', async () => {
    const source: ServerSearchSource<Row> = {
      queryKey: ['picker', 'broken'],
      fetchPage: vi.fn(async () => {
        throw new ApiError('Could not load.', { error: { code: 'internal_error', message: 'Boom' } }, 500)
      }),
      toOption: (r) => ({ id: r.id, label: r.name }),
    }
    const { result } = renderHook(() => useServerSearch(source, ''), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

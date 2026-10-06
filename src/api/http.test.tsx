import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.hoisted(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/v1')
  const mock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', mock)
  return mock
})

import { api } from '@/api/client'
import { ApiError } from '@/api/errors'
import { NO_CONNECTION_MESSAGE, OFFLINE_MESSAGE, TIMEOUT_MESSAGE, guardedFetch, timeoutFor } from '@/api/http'
import { OfflineBanner } from '@/components/OfflineBanner'
import { queryClient as appQueryClient } from '@/lib/queryClient'
import { useCreatePhonebookContact, usePhonebook } from '@/queries/phonebook'
import { useAuthStore } from '@/stores/authStore'

// Review F-150: the one `fetch` the console uses. A request that never gets an answer fails with
// words a person can act on (never the browser's "Failed to fetch"), a hung request stops, a save
// pressed offline fails at once instead of being sent later, and a read nobody is waiting for any
// more is cancelled.
function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
  window.dispatchEvent(new Event(online ? 'online' : 'offline'))
}

/** A request that never answers, and rejects the way the browser does when it is aborted. */
function hang(): typeof fetch {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
    })
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  fetchMock.mockReset()
  useAuthStore.getState().setSession({ access_token: 'access-1', refresh_token: 'refresh-1' })
})

afterEach(() => {
  vi.useRealTimers()
  appQueryClient.clear()
})

describe('guardedFetch', () => {
  it('passes an answer through untouched', async () => {
    const response = json(200, { ok: true })
    fetchMock.mockResolvedValueOnce(response)
    await expect(guardedFetch('http://api.test/v1/x')).resolves.toBe(response)
  })

  it.each(['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.'])(
    'turns the browser\'s "%s" into a plain message, with no status',
    async (browserText) => {
      fetchMock.mockRejectedValueOnce(new TypeError(browserText))
      const failure = await guardedFetch('http://api.test/v1/x').catch((e: unknown) => e)
      expect(failure).toBeInstanceOf(ApiError)
      expect(failure).toMatchObject({ message: NO_CONNECTION_MESSAGE, code: 'network_error', status: undefined })
    },
  )

  it('stops a request that hangs, after 30 seconds, and says so', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce(hang())
    const pending = guardedFetch('http://api.test/v1/clients').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toMatchObject({ message: TIMEOUT_MESSAGE, code: 'timeout', status: undefined })
  })

  it('allows uploads, imports and exports two minutes', () => {
    expect(timeoutFor('http://api.test/v1/clients')).toBe(30_000)
    expect(timeoutFor('http://api.test/v1/file-uploads')).toBe(120_000)
    expect(timeoutFor('http://api.test/v1/file-uploads/f1/complete')).toBe(120_000)
    expect(timeoutFor('http://api.test/v1/colleges/import')).toBe(120_000)
    expect(timeoutFor('http://api.test/v1/leads/import/commit')).toBe(120_000)
    expect(timeoutFor('http://api.test/v1/me/exports')).toBe(120_000)
    expect(timeoutFor('http://api.test/v1/users/u1/export')).toBe(120_000)
  })

  it('refuses at once while the browser is offline, without sending anything', async () => {
    setOnline(false)
    const failure = await guardedFetch('http://api.test/v1/x', { method: 'POST' }).catch((e: unknown) => e)
    expect(failure).toMatchObject({ message: OFFLINE_MESSAGE, code: 'offline', status: undefined })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("leaves a request the caller cancelled as the browser's own rejection, not a failure message", async () => {
    fetchMock.mockImplementationOnce(hang())
    const controller = new AbortController()
    const pending = guardedFetch('http://api.test/v1/x', { signal: controller.signal }).catch((e: unknown) => e)
    controller.abort()
    const failure = await pending
    expect(failure).not.toBeInstanceOf(ApiError)
    expect((failure as Error).name).toBe('AbortError')
  })
})

describe('through the client', () => {
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={appQueryClient}>{children}</QueryClientProvider>
  }

  it('a save that meets a dropped connection shows the plain message', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useCreatePhonebookContact(), { wrapper })
    const failure = await result.current.mutateAsync({ name: 'A', category: 'Bank', phone: '1' }).catch((e: unknown) => e)
    expect((failure as Error).message).toBe(NO_CONNECTION_MESSAGE)
  })

  it('a save pressed offline fails at once and is not sent when the connection returns', async () => {
    setOnline(false)
    const { result } = renderHook(() => useCreatePhonebookContact(), { wrapper })
    act(() => result.current.mutate({ name: 'A', category: 'Bank', phone: '1' }))

    // Not held back as "paused" for later: it has already failed, with the reason.
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.isPaused).toBe(false)
    expect(result.current.error?.message).toBe(OFFLINE_MESSAGE)

    setOnline(true)
    await act(async () => {
      await appQueryClient.resumePausedMutations()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cancels a read nobody is waiting for any more', async () => {
    fetchMock.mockImplementation(hang())
    const { rerender } = renderHook(({ search }) => usePhonebook({ search }), {
      wrapper,
      initialProps: { search: 'as' },
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const firstSignal = fetchMock.mock.calls[0][1]?.signal
    expect(firstSignal?.aborted).toBe(false)

    // The person typed on: the answer for "as" is no longer wanted.
    rerender({ search: 'asha' })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(firstSignal?.aborted).toBe(true)
    expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(false)
  })

  it('sends the request, the usual way, when nothing is wrong', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [], meta: {} }))
    const { data } = await api.GET('/phonebook')
    expect(data).toEqual({ items: [], meta: {} })
  })
})

describe('the offline banner', () => {
  it('shows only while the browser is offline', () => {
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => setOnline(false))
    expect(screen.getByRole('status')).toHaveTextContent(
      'You are offline. Changes cannot be saved until the connection is back.',
    )

    act(() => setOnline(true))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

// Every read hands React Query's cancel signal to its request, so the rule above holds for every
// list and search box, not only the one tested.
describe('reads and the cancel signal', () => {
  const sources = import.meta.glob(['../queries/*.ts', '../features/**/*.{ts,tsx}', '../components/*.tsx'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  it('no `queryFn` that calls the API ignores its signal', () => {
    const offenders: string[] = []
    for (const [path, text] of Object.entries(sources)) {
      if (path.includes('.test.')) continue
      const lines = text.split('\n')
      lines.forEach((line, i) => {
        if (!/queryFn: async \(\) =>/.test(line)) return
        // The request is made within the next few lines of a `queryFn` that takes no arguments.
        const body = lines.slice(i, i + 8).join('\n')
        if (/\bapi\.(GET|POST)\(/.test(body)) offenders.push(`${path}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})

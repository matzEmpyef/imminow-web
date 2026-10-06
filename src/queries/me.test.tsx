import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The API client reads its base URL, and takes hold of `fetch`, once: when it is first imported.
// Both are put in place before that.
const fetchMock = vi.hoisted(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/v1')
  const mock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', mock)
  return mock
})

import { ApiError } from '@/api/errors'
import { api } from '@/api/client'
import { queryClient as appQueryClient } from '@/lib/queryClient'
import { useAuthStore } from '@/stores/authStore'
import { staffMe } from '@/test/me'
import { ME_QUERY_KEY, fetchMe, meBlockedError, primeMe, useMe } from './me'
import { useLogin } from './auth'

// The one identity read (review F-036), end to end through the real API client: what it asks,
// where the answer is kept (the query cache, never storage), how a sign-in seeds it, and that a
// refusal which means "your access changed" on ANY request makes the console ask again.
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function refusal(status: number, code: string, message = 'Refused.') {
  return json(status, { error: { code, message, request_id: 'r1' } })
}

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** Path and Authorization header of each request the client made. */
function requests() {
  return fetchMock.mock.calls.map(([input]) => {
    const request = input as Request
    return { path: new URL(request.url).pathname, auth: request.headers.get('Authorization') }
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  useAuthStore.getState().clear()
  sessionStorage.clear()
  appQueryClient.clear()
})

afterEach(() => {
  useAuthStore.getState().clear()
  appQueryClient.clear()
})

describe('useMe', () => {
  it('does not ask while nobody is signed in', () => {
    const { result } = renderHook(() => useMe(), { wrapper })
    expect(result.current.isLoading).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks GET /me with the session token and returns the answer', async () => {
    useAuthStore.getState().setSession({ access_token: 'access-1', refresh_token: 'refresh-1' })
    fetchMock.mockResolvedValueOnce(json(200, staffMe({ permissions: ['clients.close'] })))
    const { result } = renderHook(() => useMe(), { wrapper })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.data?.staff?.permissions).toEqual(['clients.close']))
    expect(requests()).toEqual([{ path: expect.stringMatching(/\/me$/), auth: 'Bearer access-1' }])
  })

  it('keeps the answer out of sessionStorage: only the two tokens are stored', async () => {
    useAuthStore.getState().setSession({ access_token: 'access-1', refresh_token: 'refresh-1' })
    fetchMock.mockResolvedValueOnce(json(200, staffMe()))
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    const stored = JSON.parse(sessionStorage.getItem('imminow-auth')!) as { state: Record<string, unknown> }
    expect(Object.keys(stored.state).sort()).toEqual(['accessToken', 'refreshToken'])
    expect(JSON.stringify(sessionStorage)).not.toContain('asha@example.test')
  })

  it('does not read back a user left in storage by an older build', async () => {
    sessionStorage.setItem(
      'imminow-auth',
      JSON.stringify({ state: { accessToken: 'a', refreshToken: 'r', user: { id: 'old', role: 'super_admin' } }, version: 0 }),
    )
    await useAuthStore.persist.rehydrate()
    expect(useAuthStore.getState().accessToken).toBe('a')
    expect((useAuthStore.getState() as unknown as Record<string, unknown>).user).toBeUndefined()
  })

  it('is fresh for a minute and asks again when the tab is looked at after that', () => {
    useAuthStore.getState().setSession({ access_token: 'access-1', refresh_token: 'refresh-1' })
    fetchMock.mockResolvedValue(json(200, staffMe()))
    renderHook(() => useMe(), { wrapper })
    const options = client.getQueryCache().find({ queryKey: ME_QUERY_KEY })!.observers[0].options
    expect(options.staleTime).toBe(60_000)
    expect(options.refetchOnWindowFocus).toBe(true)
  })

  it('carries the refusal code and the server message when /me refuses', async () => {
    useAuthStore.getState().setSession({ access_token: 'access-1', refresh_token: 'refresh-1' })
    fetchMock.mockResolvedValueOnce(refusal(403, 'account_disabled', 'Your account has been disabled.'))
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    const blocked = meBlockedError(result.current.error)
    expect(blocked?.code).toBe('account_disabled')
    expect(blocked?.message).toBe('Your account has been disabled.')
    // A definite answer is not asked for again.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not call a network failure a refusal', async () => {
    await expect(Promise.resolve(meBlockedError(new TypeError('Failed to fetch')))).resolves.toBeNull()
    expect(meBlockedError(new ApiError('x', { error: { code: 'permission_denied', message: 'No.' } }))).toBeNull()
  })
})

describe('signing in', () => {
  it('asks /me with the new token and stores the session only once the answer is cached', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { access_token: 'access-1', refresh_token: 'refresh-1', user: { id: 'u1', role: 'consultant' } }),
    )
    fetchMock.mockImplementationOnce(async () => {
      // The guards flip to "signed in" on the tokens, so the tokens must not be there yet.
      expect(useAuthStore.getState().accessToken).toBeNull()
      return json(200, staffMe({ permissions: ['leads.view_own'] }))
    })
    const { result } = renderHook(() => useLogin(), { wrapper })
    await result.current.mutateAsync({ email: 'asha@example.test', password: 'pw' })

    expect(requests()).toEqual([
      { path: expect.stringMatching(/\/auth\/login$/), auth: null },
      { path: expect.stringMatching(/\/me$/), auth: 'Bearer access-1' },
    ])
    expect(useAuthStore.getState().accessToken).toBe('access-1')
    expect(client.getQueryData(ME_QUERY_KEY)).toMatchObject({ scope: 'consultancy', staff: { permissions: ['leads.view_own'] } })
  })

  it('still signs in when that first /me read fails; the guards ask again', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { access_token: 'access-1', refresh_token: 'refresh-1', user: { id: 'u1', role: 'consultant' } }),
    )
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useLogin(), { wrapper })
    await result.current.mutateAsync({ email: 'asha@example.test', password: 'pw' })
    expect(useAuthStore.getState().accessToken).toBe('access-1')
    expect(client.getQueryData(ME_QUERY_KEY)).toBeUndefined()
  })

  it('primeMe leaves nothing behind when /me refuses', async () => {
    client.setQueryData(ME_QUERY_KEY, staffMe())
    fetchMock.mockResolvedValueOnce(refusal(403, 'subscription_lapsed'))
    await primeMe(client, 'access-1')
    expect(client.getQueryData(ME_QUERY_KEY)).toBeUndefined()
  })
})

describe('a refusal that means the caller’s access changed', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession({ access_token: 'access-1', refresh_token: 'refresh-1' })
    appQueryClient.setQueryData(ME_QUERY_KEY, staffMe())
  })

  const isStale = () => appQueryClient.getQueryState(ME_QUERY_KEY)?.isInvalidated === true

  it.each(['permission_denied', 'feature_locked', 'subscription_lapsed'])(
    'marks /me to be asked again when any request answers 403 %s',
    async (code) => {
      fetchMock.mockResolvedValueOnce(refusal(403, code))
      const { error } = await api.GET('/profile')
      expect(error).toBeDefined()
      expect(isStale()).toBe(true)
    },
  )

  it('leaves /me alone for other refusals and for success', async () => {
    fetchMock.mockResolvedValueOnce(refusal(403, 'forbidden'))
    await api.GET('/profile')
    fetchMock.mockResolvedValueOnce(refusal(409, 'permission_denied'))
    await api.GET('/profile')
    fetchMock.mockResolvedValueOnce(json(200, { id: 'u1' }))
    await api.GET('/profile')
    expect(isStale()).toBe(false)
  })

  it('does not ask /me again because /me itself refused (no loop)', async () => {
    fetchMock.mockResolvedValueOnce(refusal(403, 'subscription_lapsed'))
    await expect(fetchMe()).rejects.toMatchObject({ code: 'subscription_lapsed', status: 403 })
    expect(isStale()).toBe(false)
  })
})

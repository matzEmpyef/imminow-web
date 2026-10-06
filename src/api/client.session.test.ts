import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The API client reads its base URL, and takes hold of `fetch`, once: when it is first imported.
// Both are put in place before that.
const fetchMock = vi.hoisted(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/v1')
  const mock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', mock)
  return mock
})

import { api, refreshSession } from '@/api/client'
import { queryClient } from '@/lib/queryClient'
import { useSessionNoticeStore } from '@/lib/sessionNotice'
import { useAuthStore } from '@/stores/authStore'

// Review F-165: what the client does when a request is refused as "not signed in" (401). The
// session ends only when the server truly refuses to renew it; a hiccup on the renewal leaves the
// person signed in; and a refusal that belongs to an earlier session is nobody's business now.
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
const unauthorized = () => json(401, { error: { code: 'unauthorized', message: 'Sign in again.' } })

function signIn(access = 'access-1', refresh = 'refresh-1') {
  useAuthStore.getState().setSession({ access_token: access, refresh_token: refresh })
}

/** Path and Authorization header of each request that reached the network. */
function requests() {
  return fetchMock.mock.calls.map(([input, init]) => {
    if (typeof input === 'string') return { path: new URL(input).pathname, auth: null as string | null, init }
    const request = input as Request
    return { path: new URL(request.url).pathname, auth: request.headers.get('Authorization'), init }
  })
}

/** A response the test hands over when it chooses, so two things can be made to overlap. */
function deferred() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  fetchMock.mockReset()
  useAuthStore.getState().clear()
  useSessionNoticeStore.setState({ notice: null, returnBlocked: false })
  queryClient.clear()
})

afterEach(() => {
  useAuthStore.getState().clear()
  queryClient.clear()
})

describe('a request refused because the access token expired', () => {
  it('renews the session once and sends the request again with the new token', async () => {
    signIn()
    fetchMock.mockResolvedValueOnce(unauthorized())
    fetchMock.mockResolvedValueOnce(json(200, { access_token: 'access-2' }))
    fetchMock.mockResolvedValueOnce(json(200, { items: [], meta: {} }))

    const { data, error } = await api.GET('/phonebook')

    expect(error).toBeUndefined()
    expect(data).toEqual({ items: [], meta: {} })
    expect(requests().map((r) => [r.path, r.auth])).toEqual([
      ['/v1/phonebook', 'Bearer access-1'],
      ['/v1/auth/refresh', null],
      ['/v1/phonebook', 'Bearer access-2'],
    ])
    expect(useAuthStore.getState().accessToken).toBe('access-2')
  })

  it('ends the session, and says why, when the server refuses to renew it', async () => {
    signIn()
    queryClient.setQueryData(['me'], { user: { id: 'u1' } })
    queryClient.setQueryData(['clients'], { items: [{ id: 'c1' }] })
    fetchMock.mockResolvedValueOnce(unauthorized())
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: 'invalid_refresh_token', message: 'no' } }))

    const { response } = await api.GET('/phonebook')

    expect(response.status).toBe(401)
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(queryClient.getQueryData(['clients'])).toBeUndefined()
    expect(useSessionNoticeStore.getState().notice).toEqual({ reason: 'expired', userId: 'u1' })
  })

  it.each([
    ['a server error', () => Promise.resolve(json(502, {}))],
    ['too many requests', () => Promise.resolve(json(429, { error: { code: 'rate_limited', message: 'Slow down.' } }))],
    ['a dropped connection', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a reply that cannot be read', () => Promise.resolve(new Response('<html>', { status: 200 }))],
  ])('keeps the person signed in when the renewal meets %s', async (_name, renewal) => {
    signIn()
    queryClient.setQueryData(['clients'], { items: [{ id: 'c1' }] })
    fetchMock.mockResolvedValueOnce(unauthorized())
    fetchMock.mockImplementationOnce(renewal)

    const { error, response } = await api.GET('/phonebook')

    // The request fails in the ordinary way, with words a person can act on...
    expect(response.status).toBe(503)
    expect(error).toMatchObject({
      error: {
        code: 'session_check_unavailable',
        message: 'We could not reach the server. Check your connection and try again.',
      },
    })
    // ...and nothing about the session was touched.
    expect(useAuthStore.getState().accessToken).toBe('access-1')
    expect(useAuthStore.getState().refreshToken).toBe('refresh-1')
    expect(queryClient.getQueryData(['clients'])).toBeDefined()
    expect(useSessionNoticeStore.getState().notice).toBeNull()
  })

  it('keeps the person signed in when the connection drops on the second attempt', async () => {
    signIn()
    fetchMock.mockResolvedValueOnce(unauthorized())
    fetchMock.mockResolvedValueOnce(json(200, { access_token: 'access-2' }))
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const { response } = await api.GET('/phonebook')

    expect(response.status).toBe(503)
    expect(useAuthStore.getState().accessToken).toBe('access-2')
  })

  it('ends the session when even the renewed token is refused', async () => {
    signIn()
    fetchMock.mockResolvedValueOnce(unauthorized())
    fetchMock.mockResolvedValueOnce(json(200, { access_token: 'access-2' }))
    fetchMock.mockResolvedValueOnce(unauthorized())

    await api.GET('/phonebook')

    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useSessionNoticeStore.getState().notice?.reason).toBe('expired')
  })

  it('shares one renewal between requests refused together', async () => {
    signIn()
    fetchMock.mockImplementation(async (input) => {
      if (typeof input === 'string') return json(200, { access_token: 'access-2' })
      return (input as Request).headers.get('Authorization') === 'Bearer access-2' ? json(200, { items: [] }) : unauthorized()
    })

    await Promise.all([api.GET('/phonebook'), api.GET('/staff/branches'), api.GET('/staff/designations')])

    expect(requests().filter((r) => r.path === '/v1/auth/refresh')).toHaveLength(1)
  })

  it('tries the newer token without renewing again when the session was renewed meanwhile', async () => {
    signIn()
    const slow = deferred()
    fetchMock.mockReturnValueOnce(slow.promise)
    const pending = api.GET('/phonebook')
    // Another request renewed the session while this one was out.
    useAuthStore.getState().setAccessToken('access-2')
    fetchMock.mockResolvedValueOnce(json(200, { items: [] }))
    slow.resolve(unauthorized())

    const { data } = await pending

    expect(data).toEqual({ items: [] })
    expect(requests().map((r) => [r.path, r.auth])).toEqual([
      ['/v1/phonebook', 'Bearer access-1'],
      ['/v1/phonebook', 'Bearer access-2'],
    ])
  })
})

describe('a refusal that belongs to an earlier session', () => {
  it('is left alone when someone else has signed in since: no renewal, no replay, no sign-out', async () => {
    signIn('access-old', 'refresh-old')
    const slow = deferred()
    fetchMock.mockReturnValueOnce(slow.promise)
    const pending = api.POST('/phonebook', { body: { name: 'A', category: 'Bank', phone: '1' } })
    // The first person signs out and a second signs in before the answer comes back.
    useAuthStore.getState().clear()
    signIn('access-new', 'refresh-new')
    slow.resolve(unauthorized())

    const { response } = await pending

    expect(response.status).toBe(401)
    // Only the original request ever reached the network: it was not sent again as the new person.
    expect(requests().map((r) => [r.path, r.auth])).toEqual([['/v1/phonebook', 'Bearer access-old']])
    expect(useAuthStore.getState().accessToken).toBe('access-new')
    expect(useSessionNoticeStore.getState().notice).toBeNull()
  })

  it('is left alone when the person has signed out since', async () => {
    signIn()
    const slow = deferred()
    fetchMock.mockReturnValueOnce(slow.promise)
    const pending = api.GET('/phonebook')
    useAuthStore.getState().clear()
    slow.resolve(unauthorized())

    await pending

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useSessionNoticeStore.getState().notice).toBeNull()
  })

  it('does not try to renew anything for a request sent while signed out', async () => {
    fetchMock.mockResolvedValueOnce(unauthorized())
    await api.GET('/phonebook')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not store a renewal that answers after the person signed out', async () => {
    signIn()
    const slow = deferred()
    fetchMock.mockReturnValueOnce(slow.promise)
    const pending = refreshSession()
    useAuthStore.getState().clear()
    slow.resolve(json(200, { access_token: 'access-2', refresh_token: 'refresh-2' }))

    await expect(pending).resolves.toEqual({ kind: 'unavailable' })
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().refreshToken).toBeNull()
  })
})

describe('which token a request carries', () => {
  it("keeps a token the caller named itself over the store's", async () => {
    signIn('access-store')
    fetchMock.mockResolvedValueOnce(json(200, {}))
    await api.GET('/me', { headers: { Authorization: 'Bearer access-new-session' } })
    expect(requests()[0].auth).toBe('Bearer access-new-session')
  })

  it('treats a refused sign-out as the answer it is', async () => {
    signIn()
    fetchMock.mockResolvedValueOnce(unauthorized())
    await api.POST('/auth/logout', { headers: { Authorization: 'Bearer access-1' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().accessToken).toBe('access-1')
  })
})

describe('refreshSession', () => {
  it.each([400, 401, 403])('reads %i as the server refusing the session', async (status) => {
    signIn()
    fetchMock.mockResolvedValueOnce(json(status, { error: { code: 'invalid_refresh_token', message: 'no' } }))
    await expect(refreshSession()).resolves.toEqual({ kind: 'rejected' })
  })

  it.each([408, 429, 500, 502, 503, 504])('reads %i as "try again", not as a refusal', async (status) => {
    signIn()
    fetchMock.mockResolvedValueOnce(json(status, {}))
    await expect(refreshSession()).resolves.toEqual({ kind: 'unavailable' })
  })
})

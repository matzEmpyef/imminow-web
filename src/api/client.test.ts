import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/authStore'
import { requestNewAccessToken } from './client'

function signIn() {
  useAuthStore.getState().setSession({
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    user: { id: 'u1', email: 'x@y.z', first_name: 'A', last_name: 'B', role: 'consultancy_admin' } as never,
  })
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// The refresh path only (`POST /auth/refresh` through bare `fetch`) — the 401 interceptor's replay
// logic is not covered here.
describe('requestNewAccessToken', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore.getState().clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().clear()
  })

  it('sends the stored refresh token to /auth/refresh', async () => {
    signIn()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: 'access-2' }))

    await requestNewAccessToken()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/auth\/refresh$/)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ refresh_token: 'refresh-1' })
  })

  it('stores a rotated refresh token along with the new access token', async () => {
    signIn()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: 'access-2', refresh_token: 'refresh-2' }))

    await expect(requestNewAccessToken()).resolves.toBe('access-2')

    expect(useAuthStore.getState().accessToken).toBe('access-2')
    expect(useAuthStore.getState().refreshToken).toBe('refresh-2')
    expect(useAuthStore.getState().user?.id).toBe('u1') // the user is not part of a refresh
  })

  it('presents the rotated token, not the spent one, on the next refresh', async () => {
    signIn()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: 'access-2', refresh_token: 'refresh-2' }))
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: 'access-3', refresh_token: 'refresh-3' }))

    await requestNewAccessToken()
    await requestNewAccessToken()

    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ refresh_token: 'refresh-2' })
    expect(useAuthStore.getState().refreshToken).toBe('refresh-3')
  })

  it('keeps the refresh token it holds when the answer carries none (no rotation)', async () => {
    signIn()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: 'access-2' }))

    await expect(requestNewAccessToken()).resolves.toBe('access-2')

    expect(useAuthStore.getState().accessToken).toBe('access-2')
    expect(useAuthStore.getState().refreshToken).toBe('refresh-1')
  })

  it('returns null and changes nothing when the refresh is refused', async () => {
    signIn()
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'invalid_refresh_token', message: 'no' } }))

    await expect(requestNewAccessToken()).resolves.toBeNull()

    expect(useAuthStore.getState().accessToken).toBe('access-1')
    expect(useAuthStore.getState().refreshToken).toBe('refresh-1')
  })

  it('returns null without calling the server when there is no refresh token', async () => {
    await expect(requestNewAccessToken()).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

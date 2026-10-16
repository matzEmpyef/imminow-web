import { beforeEach, describe, expect, it, vi } from 'vitest'

// The API client reads its base URL, and takes hold of `fetch`, once: when it is first imported.
const fetchMock = vi.hoisted(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/v1')
  const mock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', mock)
  return mock
})

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'

function ok(): Response {
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
}

// Phase 9, decision 154: text is never sent with spaces around it, whichever form built it.
describe('what the request client sends', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    useAuthStore.getState().clear()
  })

  async function sentBody(): Promise<Record<string, unknown>> {
    const request = fetchMock.mock.calls[0][0] as Request
    return JSON.parse(await request.text())
  }

  it('trims every piece of text in a JSON body and drops control characters', async () => {
    fetchMock.mockResolvedValueOnce(ok())
    await api.POST('/auth/forgot-password', { body: { email: '  asha@example.com \u0000' } })
    expect(await sentBody()).toEqual({ email: 'asha@example.com' })
  })

  it('sends no search below 2 characters, so the list shows in full', async () => {
    fetchMock.mockResolvedValueOnce(ok())
    await api.GET('/phonebook', { params: { query: { search: ' a ', limit: 20 } } })
    const url = new URL((fetchMock.mock.calls[0][0] as Request).url)
    expect(url.searchParams.has('search')).toBe(false)
    expect(url.searchParams.get('limit')).toBe('20')
  })

  it('sends a search of 2 characters, trimmed, and cuts one past 100', async () => {
    fetchMock.mockResolvedValueOnce(ok())
    await api.GET('/phonebook', { params: { query: { search: '  ab ' } } })
    expect(new URL((fetchMock.mock.calls[0][0] as Request).url).searchParams.get('search')).toBe('ab')
    fetchMock.mockResolvedValueOnce(ok())
    await api.GET('/phonebook', { params: { query: { search: 'x'.repeat(150) } } })
    expect(new URL((fetchMock.mock.calls[1][0] as Request).url).searchParams.get('search')).toHaveLength(100)
  })

  it('leaves a password exactly as it was typed', async () => {
    fetchMock.mockResolvedValueOnce(ok())
    await api.POST('/auth/login', { body: { email: ' a@b.co ', password: '  spaced out  ' } })
    expect(await sentBody()).toEqual({ email: 'a@b.co', password: '  spaced out  ' })
  })
})

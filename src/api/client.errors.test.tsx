import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The API client reads its base URL, and takes hold of `fetch`, once: when it is first imported.
const fetchMock = vi.hoisted(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/v1')
  const mock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', mock)
  return mock
})

import { api } from '@/api/client'
import { ApiError, isRetryable, withErrorEnvelope } from '@/api/errors'
import { queryClient as appQueryClient } from '@/lib/queryClient'
import { useCreatePhonebookContact, usePhonebook } from '@/queries/phonebook'
import { useAuthStore } from '@/stores/authStore'

// Review F-149. One function turns every answer that is not a success into the error envelope,
// with its status; the client runs every answer through it; and the retry rule reads the status.
function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  fetchMock.mockReset()
  useAuthStore.getState().setSession({ access_token: 'access-1', refresh_token: 'refresh-1' })
})

describe('withErrorEnvelope', () => {
  it('leaves a success alone', async () => {
    const response = json(200, { ok: true })
    expect(await withErrorEnvelope(response)).toBe(response)
  })

  it("keeps the server's own envelope and adds the status", async () => {
    const out = await withErrorEnvelope(
      json(409, { error: { code: 'conflict', message: 'Already recorded.', request_id: 'req-9', details: { id: 'x' } } }),
    )
    expect(out.status).toBe(409)
    expect(await out.json()).toEqual({
      error: { code: 'conflict', message: 'Already recorded.', request_id: 'req-9', details: { id: 'x' }, status: 409 },
    })
  })

  it.each([
    ['an empty body', () => new Response(null, { status: 502 })],
    ['a web page', () => new Response('<html><body>Bad Gateway</body></html>', { status: 502 })],
    ['a JSON value that is not an envelope', () => json(502, ['nope'])],
  ])('makes an envelope for %s, so the answer can never read as a success', async (_name, make) => {
    const out = await withErrorEnvelope(make())
    expect(out.status).toBe(502)
    expect(await out.json()).toEqual({ error: { code: 'http_502', message: '', status: 502 } })
  })

  it('takes the request reference from the header when the body has none', async () => {
    const out = await withErrorEnvelope(new Response(null, { status: 504, headers: { 'X-Request-ID': 'req-77' } }))
    expect((await out.json()).error.request_id).toBe('req-77')
  })

  it("reads a framework refusal's `detail` as the message", async () => {
    const out = await withErrorEnvelope(json(404, { detail: 'Not Found' }))
    expect((await out.json()).error).toMatchObject({ code: 'http_404', message: 'Not Found', status: 404 })
  })
})

describe('an ApiError built from an answer', () => {
  it('carries the status from the envelope without the caller passing it', () => {
    const err = new ApiError('Could not save.', { error: { code: 'http_502', message: '', status: 502 } })
    expect(err.status).toBe(502)
    expect(err.message).toBe('Could not save.')
  })

  it('prefers a status the caller passed, and has none when there was no answer', () => {
    expect(new ApiError('x', { error: { status: 500 } }, 503).status).toBe(503)
    expect(new ApiError('x').status).toBeUndefined()
  })
})

describe('the client', () => {
  it('reports an error answer with an empty body as an error, not as a success', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 502 }))
    const { data, error } = await api.POST('/phonebook', { body: { name: 'A', category: 'Bank', phone: '1' } })
    expect(data).toBeUndefined()
    expect(error).toMatchObject({ error: { code: 'http_502', status: 502 } })
  })

  it('so a save behind a failing gateway fails, with its status, instead of saying "saved"', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 502 }))
    const { result } = renderHook(() => useCreatePhonebookContact(), { wrapper })
    const failure = await result.current.mutateAsync({ name: 'A', category: 'Bank', phone: '1' }).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ status: 502, message: 'Could not add this contact.' })
  })

  it("gives every refusal its status and the server's words", async () => {
    fetchMock.mockResolvedValueOnce(
      json(403, { error: { code: 'permission_denied', message: 'Ask an admin for access.', request_id: 'req-3' } }),
    )
    const { result } = renderHook(() => useCreatePhonebookContact(), { wrapper })
    const failure = await result.current.mutateAsync({ name: 'A', category: 'Bank', phone: '1' }).catch((e: unknown) => e)
    expect(failure).toMatchObject({
      status: 403,
      code: 'permission_denied',
      message: 'Ask an admin for access.',
      requestId: 'req-3',
    })
  })
})

describe('which failed reads are asked again', () => {
  it.each([
    ['no answer at all (not an ApiError)', new TypeError('Failed to fetch'), true],
    ['no status', new ApiError('No connection.'), true],
    ['429 too many requests', new ApiError('x', undefined, 429), true],
    ['500', new ApiError('x', undefined, 500), true],
    ['502 during a deploy', new ApiError('x', undefined, 502), true],
    ['503', new ApiError('x', undefined, 503), true],
    ['400', new ApiError('x', undefined, 400), false],
    ['401', new ApiError('x', undefined, 401), false],
    ['403', new ApiError('x', undefined, 403), false],
    ['404', new ApiError('x', undefined, 404), false],
    ['409', new ApiError('x', undefined, 409), false],
    ['422', new ApiError('x', undefined, 422), false],
  ])('%s → %s', (_name, error, expected) => {
    expect(isRetryable(error)).toBe(expected)
  })

  it('at most twice, by the rule the whole console uses', () => {
    const retry = appQueryClient.getDefaultOptions().queries?.retry as (count: number, error: Error) => boolean
    const deploy = new ApiError('x', undefined, 502)
    expect(retry(0, deploy)).toBe(true)
    expect(retry(1, deploy)).toBe(true)
    expect(retry(2, deploy)).toBe(false)
    expect(retry(0, new ApiError('x', undefined, 403))).toBe(false)
  })

  it('a read that meets a 502 and then an answer shows the answer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 502 }))
      fetchMock.mockResolvedValueOnce(json(200, { items: [{ id: 'p1' }], meta: { categories: [] } }))
      const appWrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={appQueryClient}>{children}</QueryClientProvider>
      )
      const { result } = renderHook(() => usePhonebook(), { wrapper: appWrapper })
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      await vi.advanceTimersByTimeAsync(1500)
      await vi.waitFor(() => expect(result.current.data?.items).toEqual([{ id: 'p1' }]))
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
      appQueryClient.clear()
    }
  })
})

// The pattern F-149 retired: building the error from the server's sentence alone, which threw the
// body (and with it the status, the code and the request reference) away. Every error made from
// an answer is made from the answer.
describe('how the query modules build their errors', () => {
  const sources = import.meta.glob(['../queries/*.ts', '../lib/**/*.ts', '../features/**/*.{ts,tsx}'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  const lines = Object.entries(sources)
    .filter(([path]) => !path.includes('.test.'))
    .flatMap(([path, text]) => text.split('\n').map((line, i) => ({ where: `${path}:${i + 1}`, line })))

  it('reads enough of the source to mean something', () => {
    expect(lines.filter(({ line }) => line.includes('new ApiError(')).length).toBeGreaterThan(300)
  })

  it('never from the message alone', () => {
    const offenders = lines.filter(({ line }) => /new ApiError\(\s*\w*[eE]rror\b/.test(line))
    expect(offenders.map((o) => o.where)).toEqual([])
  })

  it('always passes the answer it is reporting', () => {
    // `if (error) throw new ApiError('…', error)` — the variable tested is the one handed over.
    const offenders = lines.filter(({ line }) => {
      const match = /if \((\w*[eE]rror)\b[^)]*\) throw new ApiError\(/.exec(line)
      if (!match) return false
      return !new RegExp(`,\\s*${match[1]}\\s*[,)]`).test(line.slice(match.index))
    })
    expect(offenders.map((o) => o.where)).toEqual([])
  })
})

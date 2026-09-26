import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/client', () => ({ api: { POST: vi.fn() } }))

import { api } from '@/api/client'
import { fetchRealtimeTicket } from './bootstrap'

const mockedPost = vi.mocked(api.POST)

// `POST /realtime/tickets` classification (Wave 3 plan §6.1) — the manager only sees the result of
// this, so its own tests (connectionManager.test.ts) stub `fetchTicket` directly; these pin the
// translation from the API client's raw openapi-fetch shape to that result.
describe('fetchRealtimeTicket', () => {
  beforeEach(() => mockedPost.mockReset())

  it('returns the url on success', async () => {
    mockedPost.mockResolvedValue({
      data: { ticket: 't1', url: 'wss://api/realtime?ticket=t1', expires_at: '2026-09-26T00:00:30Z' },
      error: undefined,
      response: { status: 201 },
    } as never)

    await expect(fetchRealtimeTicket()).resolves.toEqual({ ok: true, url: 'wss://api/realtime?ticket=t1' })
  })

  it('reads retry_after_s off a 503 realtime_disabled and reports it as "disabled"', async () => {
    mockedPost.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'realtime_disabled', message: 'off', request_id: 'r1', details: { retry_after_s: 45 } } },
      response: { status: 503 },
    } as never)

    await expect(fetchRealtimeTicket()).resolves.toEqual({ ok: false, reason: 'disabled', retryAfterS: 45 })
  })

  it('defaults retry_after_s to 300 when the server omits it', async () => {
    mockedPost.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'realtime_disabled', message: 'off', request_id: 'r1' } },
      response: { status: 503 },
    } as never)

    await expect(fetchRealtimeTicket()).resolves.toEqual({ ok: false, reason: 'disabled', retryAfterS: 300 })
  })

  it('reports 429 rate_limited distinctly from a plain error', async () => {
    mockedPost.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'rate_limited', message: 'slow down', request_id: 'r2' } },
      response: { status: 429 },
    } as never)

    await expect(fetchRealtimeTicket()).resolves.toEqual({ ok: false, reason: 'rate_limited' })
  })

  it('falls back to a plain "error" for anything else (e.g. a 500 or network failure)', async () => {
    mockedPost.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'internal_error', message: 'boom', request_id: 'r3' } },
      response: { status: 500 },
    } as never)

    await expect(fetchRealtimeTicket()).resolves.toEqual({ ok: false, reason: 'error' })
  })
})

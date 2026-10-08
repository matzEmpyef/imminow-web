import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// The money-correctness round (2026-10-08): the void-requests filter and its count, a payment
// received in another currency, the small-difference settlement, Finance's answer to a void, and
// voiding a PR contribution. Each hook must hit its route with exactly what the contract names.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { accessToken: string }) => unknown) => selector({ accessToken: 't' }),
}))
vi.mock('./standing', () => ({ refreshStanding: vi.fn() }))

import { api } from '@/api/client'
import { useVoidPrCommissionEntry } from './clients'
import {
  FINANCE_QUERY_KEY,
  useDecideInstallmentVoid,
  useFinanceCases,
  useFinanceVoidRequestCount,
  useReceiveCommissionDue,
  useSettleCommissionDue,
} from './financeDashboard'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return { wrapper, invalidate }
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
})

describe('void requests on the finance cases list', () => {
  it('asks for filter[void_requested]=true', async () => {
    mockedGet.mockResolvedValue({ data: { items: [], meta: { total: 0 } }, error: undefined } as never)
    const { wrapper } = setup()
    const { result } = renderHook(() => useFinanceCases({ void_requested: true }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const query = (mockedGet.mock.calls[0][1] as { params: { query: { filter: unknown } } }).params.query
    expect(query.filter).toEqual({ void_requested: 'true' })
  })

  it('counts them from the list’s meta.total', async () => {
    mockedGet.mockResolvedValue({ data: { items: [{}], meta: { total: 4 } }, error: undefined } as never)
    const { wrapper } = setup()
    const { result } = renderHook(() => useFinanceVoidRequestCount(), { wrapper })
    await waitFor(() => expect(result.current.data).toBe(4))

    expect(mockedGet.mock.calls[0][0]).toBe('/commission/finance/cases')
    const query = (mockedGet.mock.calls[0][1] as { params: { query: unknown } }).params.query
    expect(query).toEqual({ filter: { void_requested: 'true' }, limit: 1 })
  })
})

describe('useReceiveCommissionDue', () => {
  it('sends the other-currency fields when the money arrived in another currency', async () => {
    mockedPost.mockResolvedValue({ data: { id: 'e1' }, error: undefined } as never)
    const { wrapper } = setup()
    const { result } = renderHook(() => useReceiveCommissionDue(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        entryId: 'e1',
        amount: 1000,
        currency: 'USD',
        allow_cross_currency: true,
        owed_currency: 'CAD',
        rate: 1.4,
        idempotencyKey: 'k1',
      })
    })

    expect(mockedPost.mock.calls[0][0]).toBe('/commission-entries/{id}/receive')
    expect((mockedPost.mock.calls[0][1] as { body: unknown }).body).toMatchObject({
      amount: 1000,
      currency: 'USD',
      allow_cross_currency: true,
      owed_currency: 'CAD',
      rate: 1.4,
    })
  })
})

describe('useSettleCommissionDue', () => {
  it('POSTs the part and the reason with the caller’s idempotency key', async () => {
    mockedPost.mockResolvedValue({ data: { id: 'e1' }, error: undefined } as never)
    const { wrapper, invalidate } = setup()
    const { result } = renderHook(() => useSettleCommissionDue(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ entryId: 'e1', part_key: 'p1', reason: 'Bank charges', idempotencyKey: 'k1' })
    })

    expect(mockedPost).toHaveBeenCalledWith('/commission-entries/{id}/settle', {
      params: { path: { id: 'e1' }, header: { 'Idempotency-Key': 'k1' } },
      body: { part_key: 'p1', reason: 'Bank charges' },
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [FINANCE_QUERY_KEY] })
  })

  it('keeps the server’s percentages on a refusal above the limit', async () => {
    mockedPost.mockResolvedValue({
      data: undefined,
      error: {
        error: {
          code: 'permission_denied',
          message: 'Only a Super Admin may settle this.',
          details: { shortfall_percent: 8.25, limit_percent: 5 },
        },
      },
      response: { status: 403 },
    } as never)
    const { wrapper } = setup()
    const { result } = renderHook(() => useSettleCommissionDue(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ entryId: 'e1', part_key: 'p1', reason: 'Bank charges' }).catch(() => undefined)
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as { details?: unknown }).details).toEqual({ shortfall_percent: 8.25, limit_percent: 5 })
  })
})

describe('useDecideInstallmentVoid', () => {
  it('POSTs the decision to the installment’s void-decision route', async () => {
    const refreshed = { id: 'e1', due_schedule: [] }
    mockedPost.mockResolvedValue({ data: refreshed, error: undefined } as never)
    const { wrapper, invalidate } = setup()
    const { result } = renderHook(() => useDecideInstallmentVoid(), { wrapper })

    let answer: unknown
    await act(async () => {
      answer = await result.current.mutateAsync({ entryId: 'e1', installmentId: 'i1', approve: false, reason: 'Money was received' })
    })

    // The whole refreshed Finance case row comes back, untouched.
    expect(answer).toBe(refreshed)

    expect(mockedPost).toHaveBeenCalledWith('/commission-entries/{id}/installments/{installmentId}/void-decision', {
      params: { path: { id: 'e1', installmentId: 'i1' } },
      body: { approve: false, reason: 'Money was received' },
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [FINANCE_QUERY_KEY] })
  })

  it.each(['conflict', 'already_voided', 'part_settled'])(
    'on 409 %s keeps the server’s sentence and reads the case again',
    async (code) => {
      mockedPost.mockResolvedValue({
        data: undefined,
        error: { error: { code, message: `Refused: ${code}.` } },
        response: { status: 409 },
      } as never)
      const { wrapper, invalidate } = setup()
      const { result } = renderHook(() => useDecideInstallmentVoid(), { wrapper })

      await act(async () => {
        await result.current.mutateAsync({ entryId: 'e1', installmentId: 'i1', approve: true }).catch(() => undefined)
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error?.message).toBe(`Refused: ${code}.`)
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [FINANCE_QUERY_KEY] })
    },
  )
})

describe('useVoidPrCommissionEntry', () => {
  it('POSTs the reason to the case’s commission-entry void route', async () => {
    mockedPost.mockResolvedValue({ data: { id: 'e1', status: 'voided' }, error: undefined } as never)
    const { wrapper, invalidate } = setup()
    const { result } = renderHook(() => useVoidPrCommissionEntry('c1'), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('Wrong currency')
    })

    expect(mockedPost).toHaveBeenCalledWith('/clients/{id}/commission-entry/void', {
      params: { path: { id: 'c1' } },
      body: { reason: 'Wrong currency' },
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['clients', 'c1', 'commissions'] })
  })

  it.each(['part_settled', 'conflict'])('surfaces the server’s sentence on 409 %s', async (code) => {
    mockedPost.mockResolvedValue({
      data: undefined,
      error: { error: { code, message: `Refused: ${code}.` } },
    } as never)
    const { wrapper } = setup()
    const { result } = renderHook(() => useVoidPrCommissionEntry('c1'), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('Wrong currency').catch(() => undefined)
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe(`Refused: ${code}.`)
  })
})

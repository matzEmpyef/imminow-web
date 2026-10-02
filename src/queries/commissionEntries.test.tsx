import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// Contract gate 11, F14: removing an installment became a VOID with a mandatory reason
// (`POST …/installments/{id}/void`), replacing the DELETE. The row is never deleted, so the hook
// must hit the void route with the reason and an Idempotency-Key, surface the server's refusal
// (409 `part_settled`) as an ApiError, and refresh the commission views on success.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))

import { api } from '@/api/client'
import { useVoidInstallment } from './commissionEntries'

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
  mockedPost.mockReset()
})

describe('useVoidInstallment', () => {
  it('POSTs the void route with the reason and the caller’s idempotency key', async () => {
    mockedPost.mockResolvedValue({ data: { id: 'i1', voided_at: '2026-10-02T10:00:00Z' }, error: undefined } as never)
    const { wrapper, invalidate } = setup()
    const { result } = renderHook(() => useVoidInstallment('client-1'), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ entryId: 'e1', installmentId: 'i1', reason: 'Wrong source', idempotencyKey: 'key-1' })
    })

    expect(mockedPost).toHaveBeenCalledWith('/commission-entries/{id}/installments/{installmentId}/void', {
      params: { path: { id: 'e1', installmentId: 'i1' }, header: { 'Idempotency-Key': 'key-1' } },
      body: { reason: 'Wrong source' },
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['clients', 'client-1', 'commissions'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['commission'] })
  })

  it('generates an idempotency key when none is passed', async () => {
    mockedPost.mockResolvedValue({ data: {}, error: undefined } as never)
    const { wrapper } = setup()
    const { result } = renderHook(() => useVoidInstallment('client-1'), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ entryId: 'e1', installmentId: 'i1', reason: 'Duplicate' })
    })

    const opts = mockedPost.mock.calls[0][1] as { params: { header: { 'Idempotency-Key': string } } }
    expect(opts.params.header['Idempotency-Key']).toBeTruthy()
  })

  it('surfaces the server refusal and does not refresh the views', async () => {
    mockedPost.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'part_settled', message: 'A payment is already allocated to this installment.' } },
    } as never)
    const { wrapper, invalidate } = setup()
    const { result } = renderHook(() => useVoidInstallment('client-1'), { wrapper })

    await act(async () => {
      await result.current
        .mutateAsync({ entryId: 'e1', installmentId: 'i1', reason: 'Wrong source' })
        .catch(() => undefined)
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('allocated')
    expect(invalidate).not.toHaveBeenCalled()
  })
})

import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-297: the four writes that used to mint a new Idempotency-Key per attempt (applicant
// transfer, college import, bulk allocation, conversion answer) send the key the form holds, and
// treat "already applied" as done: the lists are refreshed (the forms say "This was already
// recorded").
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))

import { api } from '@/api/client'
import { useImportColleges } from './adminColleges'
import { useTransferApplicant } from './clients'
import { useBulkAllocateLeads, useRespondToConversion } from './leads'

const mockedPost = vi.mocked(api.POST)

const alreadyApplied = {
  data: undefined,
  error: {
    error: { code: 'conflict', message: 'Already done.', status: 409, details: { idempotency: 'already_applied' } },
  },
  response: { status: 409 },
} as never

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const refreshed = () => invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
  return { wrapper, refreshed }
}

function sentKey() {
  const init = mockedPost.mock.calls[0]?.[1] as unknown as { params: { header: Record<string, string> } }
  return init.params.header['Idempotency-Key']
}

beforeEach(() => mockedPost.mockReset())

describe('the key the form holds is the key that is sent', () => {
  it('applicant transfer', async () => {
    mockedPost.mockResolvedValue({ data: undefined, error: undefined, response: { status: 204 } } as never)
    const { wrapper } = setup()
    const { result } = renderHook(() => useTransferApplicant('c1'), { wrapper })
    await act(() =>
      result.current.mutateAsync({ newConsultancyId: 'n1', reason: 'r', transferCode: 'ABC', idempotencyKey: 'key-1' }),
    )
    expect(sentKey()).toBe('key-1')
  })

  it('college import', async () => {
    mockedPost.mockResolvedValue({ data: { created: 1 }, error: undefined, response: { status: 200 } } as never)
    const { wrapper } = setup()
    const { result } = renderHook(() => useImportColleges(), { wrapper })
    await act(() => result.current.mutateAsync({ file: new File(['x'], 'c.csv'), idempotencyKey: 'key-2' }))
    expect(sentKey()).toBe('key-2')
  })

  it('conversion answer', async () => {
    mockedPost.mockResolvedValue({ data: { client_id: 'c9' }, error: undefined, response: { status: 200 } } as never)
    const { wrapper } = setup()
    const { result } = renderHook(() => useRespondToConversion('l1'), { wrapper })
    await act(() => result.current.mutateAsync({ proposalId: 'p1', decision: 'approved', idempotencyKey: 'key-3' }))
    expect(sentKey()).toBe('key-3')
  })
})

describe('an "already applied" answer refreshes what success refreshes', () => {
  it('applicant transfer refreshes the clients lists', async () => {
    mockedPost.mockResolvedValue(alreadyApplied)
    const { wrapper, refreshed } = setup()
    const { result } = renderHook(() => useTransferApplicant('c1'), { wrapper })
    await act(() =>
      result.current
        .mutateAsync({ newConsultancyId: 'n1', reason: 'r', transferCode: 'ABC', idempotencyKey: 'k' })
        .catch(() => {}),
    )
    await waitFor(() => expect(refreshed()).toContainEqual(['clients']))
  })

  it('college import refreshes the colleges list', async () => {
    mockedPost.mockResolvedValue(alreadyApplied)
    const { wrapper, refreshed } = setup()
    const { result } = renderHook(() => useImportColleges(), { wrapper })
    await act(() => result.current.mutateAsync({ file: new File(['x'], 'c.csv'), idempotencyKey: 'k' }).catch(() => {}))
    await waitFor(() => expect(refreshed()).toContainEqual(['admin-colleges']))
  })

  it('bulk allocation refreshes the leads lists', async () => {
    mockedPost.mockResolvedValue(alreadyApplied)
    const { wrapper, refreshed } = setup()
    const { result } = renderHook(() => useBulkAllocateLeads(), { wrapper })
    await act(() =>
      result.current.mutateAsync({ lead_ids: ['a'], employee_id: 'e', idempotencyKey: 'k' }).catch(() => {}),
    )
    await waitFor(() => expect(refreshed()).toContainEqual(['leads']))
  })

  it('conversion answer refreshes the lead and the clients', async () => {
    mockedPost.mockResolvedValue(alreadyApplied)
    const { wrapper, refreshed } = setup()
    const { result } = renderHook(() => useRespondToConversion('l1'), { wrapper })
    await act(() =>
      result.current.mutateAsync({ proposalId: 'p1', decision: 'approved', idempotencyKey: 'k' }).catch(() => {}),
    )
    await waitFor(() => expect(refreshed()).toContainEqual(['clients']))
    expect(refreshed()).toContainEqual(['leads', 'l1'])
  })
})

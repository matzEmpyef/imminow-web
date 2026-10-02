import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// Contract gate 12 paged four lists: the applicant-allocation queue, the case/service follow-up
// queues, and the freelancer roster / rates. The frozen mock ignores the cursor and still answers
// with a plain array (or, for the follow-ups, `items` with no `meta`), so each hook has to (a) put
// the cursor on the wire, (b) read both shapes, and (c) leave `meta.next_cursor` unset when there
// is nowhere further to go — that is what keeps the "next" button away.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useApplicantAllocationQueue } from './applicantAllocation'
import { useServiceFollowups } from './serviceFollowups'
import { useCaseFollowups } from './caseFollowups'
import { useAllFreelancers, useFreelancerRates, useFreelancers } from './freelancerRates'

const mockedGet = vi.mocked(api.GET)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function respond(data: unknown) {
  mockedGet.mockResolvedValue({ data, error: undefined } as never)
}

beforeEach(() => {
  mockedGet.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('applicant allocation queue', () => {
  it('reads the frozen mock’s plain array as one complete page', async () => {
    respond([{ id: 'a1' }, { id: 'a2' }])
    const { result } = renderHook(() => useApplicantAllocationQueue(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.items).toHaveLength(2)
    expect(result.current.data?.meta?.next_cursor).toBeUndefined()
  })

  it('reads the cursor envelope and sends the cursor it is given', async () => {
    respond({ items: [{ id: 'a3' }], meta: { next_cursor: 'c3', total: 41 } })
    const { result } = renderHook(() => useApplicantAllocationQueue('c2'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedGet).toHaveBeenCalledWith('/applicant-allocation-queue', { params: { query: { cursor: 'c2' } } })
    expect(result.current.data?.meta?.next_cursor).toBe('c3')
  })
})

describe('follow-up queues', () => {
  it('sends the cursor with the snoozed flag for the service queue and keeps the summary', async () => {
    respond({ items: [{ student_id: 's1' }], summary: { total: 120 }, meta: { next_cursor: 'n2' } })
    const { result } = renderHook(() => useServiceFollowups(true, 'c9'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedGet).toHaveBeenCalledWith('/service-followups', {
      params: { query: { include_snoozed: true, cursor: 'c9' } },
    })
    expect(result.current.data?.meta?.next_cursor).toBe('n2')
    expect(result.current.data?.summary.total).toBe(120)
  })

  it('treats a response with no meta (frozen mock) as unpaged for the case queue', async () => {
    respond({ items: [{ journey_id: 'j1' }], summary: { total: 1 } })
    const { result } = renderHook(() => useCaseFollowups(false), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedGet).toHaveBeenCalledWith('/case-followups', {
      params: { query: { include_snoozed: false, cursor: undefined } },
    })
    expect(result.current.data && 'meta' in result.current.data ? result.current.data.meta : undefined).toBeUndefined()
  })
})

describe('freelancers and rates', () => {
  it('pages the roster by cursor and reads either shape', async () => {
    respond({ items: [{ id: 'f1' }], meta: { next_cursor: 'f2' } })
    const { result } = renderHook(() => useFreelancers('f1c'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedGet).toHaveBeenCalledWith('/freelancers', { params: { query: { cursor: 'f1c' } } })
    expect(result.current.data?.meta?.next_cursor).toBe('f2')
  })

  it('walks every roster page for the picker, 100 rows a request', async () => {
    mockedGet.mockImplementation((async (_path: unknown, opts: { params: { query: { cursor?: string } } }) => {
      const { cursor } = opts.params.query
      if (!cursor) return { data: { items: [{ id: 'f1' }], meta: { next_cursor: 'p2' } }, error: undefined }
      if (cursor === 'p2') return { data: { items: [{ id: 'f2' }], meta: { next_cursor: null } }, error: undefined }
      throw new Error(`unexpected cursor ${cursor}`)
    }) as never)
    const { result } = renderHook(() => useAllFreelancers(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((f) => f.id)).toEqual(['f1', 'f2'])
    expect(mockedGet).toHaveBeenCalledWith('/freelancers', { params: { query: { cursor: undefined, limit: 100 } } })
  })

  it('finds a rate row on a later page, and still works against the plain-array mock', async () => {
    mockedGet.mockImplementation((async (_path: unknown, opts: { params: { query: { cursor?: string } } }) => {
      return opts.params.query.cursor
        ? { data: { items: [{ id: 'r2', freelancer_id: 'f2' }], meta: {} }, error: undefined }
        : { data: { items: [{ id: 'r1', freelancer_id: 'f1' }], meta: { next_cursor: 'p2' } }, error: undefined }
    }) as never)
    const paged = renderHook(() => useFreelancerRates(), { wrapper })
    await waitFor(() => expect(paged.result.current.isSuccess).toBe(true))
    expect(paged.result.current.data?.find((r) => r.freelancer_id === 'f2')?.id).toBe('r2')

    mockedGet.mockReset()
    respond([{ id: 'r1', freelancer_id: 'f1' }])
    const plain = renderHook(() => useFreelancerRates(), { wrapper })
    await waitFor(() => expect(plain.result.current.isSuccess).toBe(true))
    expect(plain.result.current.data).toHaveLength(1)
  })
})

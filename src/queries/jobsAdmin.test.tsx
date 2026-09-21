import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// `GET /jobs/locations` gained `scope` and `status` (product owner, 2026-09-21). What is worth
// pinning is the WIRE, not the hook's arguments: the console's Jobs list is one of two products
// reading this endpoint, and the contract's rules are about the request that leaves the browser.
//
//   1. the admin list asks for `scope=all` with whatever status chips are ticked, because the
//      counts it prints have to be the counts of the rows it is showing;
//   2. `status` without `scope=all` is a 400, so it must not be possible to send one;
//   3. the student-facing call is UNCHANGED — no parameters at all, which the server reads as
//      live-only. That is the half of this change that must stay invisible.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useJobLocations, type JobLocationsQuery } from './jobsAdmin'

const mockedGet = vi.mocked(api.GET)

/** The query object that actually left the browser, or `undefined` if none was sent. */
async function sentQuery(args?: JobLocationsQuery) {
  // Built once per hook, not per render — a provider handed a fresh QueryClient on every render
  // would throw away the query it is meant to be running.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useJobLocations(args), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  const [path, init] = mockedGet.mock.calls.at(-1) as unknown as [string, { params?: { query?: unknown } }]
  expect(path).toBe('/jobs/locations')
  return init.params?.query
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedGet.mockResolvedValue({ data: [], error: undefined } as never)
  // The hook is gated on a session, the same as every other read in this file.
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('useJobLocations', () => {
  it('sends no parameters at all for the student-facing call, which the server reads as live', async () => {
    expect(await sentQuery()).toBeUndefined()
  })

  it('sends scope=all with the ticked statuses, so the counts match the rows', async () => {
    expect(await sentQuery({ scope: 'all', status: 'expired,off' })).toEqual({
      country: undefined,
      scope: 'all',
      status: 'expired,off',
    })
  })

  it('sends scope=all with no status when no chip is ticked', async () => {
    expect(await sentQuery({ scope: 'all' })).toEqual({ country: undefined, scope: 'all', status: undefined })
  })

  it('carries the country rung and the scope together', async () => {
    expect(await sentQuery({ country: 'Germany', scope: 'all' })).toEqual({
      country: 'Germany',
      scope: 'all',
      status: undefined,
    })
  })

  it('drops a status that is not accompanied by scope=all, which the server refuses 400', async () => {
    expect(await sentQuery({ status: 'expired' })).toBeUndefined()
  })
})

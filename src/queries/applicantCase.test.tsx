import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Which questions the move form asks: the served flags win, and the extra case-view read is only
// the fallback when `has_accepted_college` is not served.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useCarryQuestions } from './applicantCase'

const mockedGet = vi.mocked(api.GET)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function caseView(extra: Record<string, unknown>, accepted = false) {
  mockedGet.mockResolvedValue({
    data: { applications: [{ status: accepted ? 'accepted' : 'shortlisted' }], ...extra },
    error: undefined,
  } as never)
}

beforeEach(() => {
  mockedGet.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('useCarryQuestions', () => {
  it('asks nothing, and reads nothing, without a case', () => {
    const { result } = renderHook(() => useCarryQuestions(undefined, { has_accepted_college: true }), { wrapper })
    expect(result.current).toEqual({ admission: false, payments: false })
    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('uses the flags the form already holds, and makes no extra read', () => {
    const { result } = renderHook(
      () => useCarryQuestions('j1', { has_accepted_college: true, has_recorded_payments: true }),
      { wrapper },
    )
    expect(result.current).toEqual({ admission: true, payments: true })
    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('asks the money question unless has_recorded_payments is false', () => {
    const none = renderHook(() => useCarryQuestions('j1', { has_accepted_college: true, has_recorded_payments: false }), { wrapper })
    expect(none.result.current).toEqual({ admission: true, payments: false })
    const unknown = renderHook(() => useCarryQuestions('j1', { has_accepted_college: true }), { wrapper })
    expect(unknown.result.current).toEqual({ admission: true, payments: true })
  })

  it('asks neither when the server says no college has accepted', () => {
    const { result } = renderHook(
      () => useCarryQuestions('j1', { has_accepted_college: false, has_recorded_payments: true }),
      { wrapper },
    )
    expect(result.current).toEqual({ admission: false, payments: false })
  })

  it('falls back to the case view when the form holds no flag, reading the flags it carries', async () => {
    caseView({ has_accepted_college: true, has_recorded_payments: false })
    const { result } = renderHook(() => useCarryQuestions('j1', {}), { wrapper })
    await waitFor(() => expect(result.current).toEqual({ admission: true, payments: false }))
  })

  it('falls back to the applications when the case view serves no flag', async () => {
    caseView({}, true)
    const { result } = renderHook(() => useCarryQuestions('j1', {}), { wrapper })
    await waitFor(() => expect(result.current).toEqual({ admission: true, payments: true }))
  })

  it('does not ask when the applications show no accepted college and no flag is served', async () => {
    caseView({}, false)
    const { result } = renderHook(() => useCarryQuestions('j1', {}), { wrapper })
    await waitFor(() => expect(mockedGet).toHaveBeenCalled())
    expect(result.current).toEqual({ admission: false, payments: false })
  })
})

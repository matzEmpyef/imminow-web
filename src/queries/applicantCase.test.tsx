import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Whether the move form asks "does the admission go too": the contract serves no flag for an
// accepted college on the move forms' own reads, so it is read from the case's applications.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useAsksAboutAdmission } from './applicantCase'

const mockedGet = vi.mocked(api.GET)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function caseView(accepted: boolean) {
  mockedGet.mockResolvedValue({
    data: { applications: [{ status: accepted ? 'accepted' : 'applied' }] },
    error: undefined,
  } as never)
}

beforeEach(() => {
  mockedGet.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('useAsksAboutAdmission', () => {
  it('asks nothing, and reads nothing, without a case', () => {
    const { result } = renderHook(() => useAsksAboutAdmission(undefined), { wrapper })
    expect(result.current).toBe(false)
    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('asks when the applications show an accepted college', async () => {
    caseView(true)
    const { result } = renderHook(() => useAsksAboutAdmission('j1'), { wrapper })
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('does not ask when the applications show no accepted college', async () => {
    caseView(false)
    const { result } = renderHook(() => useAsksAboutAdmission('j1'), { wrapper })
    await waitFor(() => expect(mockedGet).toHaveBeenCalled())
    expect(result.current).toBe(false)
  })

  it('asks anyway when the case view cannot be read', async () => {
    mockedGet.mockResolvedValue({ data: undefined, error: { error: { code: 'forbidden', message: 'No.' } } } as never)
    const { result } = renderHook(() => useAsksAboutAdmission('j1'), { wrapper })
    await waitFor(() => expect(result.current).toBe(true))
  })
})

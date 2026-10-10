import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// Super Admin KYC review. Verify and Reject both name the certificate the reviewer opened by its
// `uploaded_at`; a 409 (`already_reviewed`, `conflict`) reads as the server's own sentence and
// reads the row again.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))

import { api } from '@/api/client'
import { useRejectKyc, useVerifyKyc } from './kyc'

const mockedPost = vi.mocked(api.POST)
const UPLOADED_AT = '2026-10-08T08:15:00.123456Z'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return { invalidate, wrapper }
}

function refused(status: number, code: string, message: string) {
  return {
    data: undefined,
    error: { error: { code, message, status } },
    response: { status },
  } as never
}

beforeEach(() => {
  mockedPost.mockReset()
})

describe('useRejectKyc', () => {
  it('sends the reason and the upload time of the certificate the reviewer opened', async () => {
    mockedPost.mockResolvedValue({ data: { status: 'rejected' }, error: undefined, response: { status: 200 } } as never)
    const { wrapper } = setup()
    const { result } = renderHook(() => useRejectKyc(), { wrapper })
    await act(() => result.current.mutateAsync({ consultancyId: 'c1', reason: 'Blurred.', uploadedAt: UPLOADED_AT }))
    expect(mockedPost).toHaveBeenCalledWith('/consultancies/{id}/kyc/reject', {
      params: { path: { id: 'c1' } },
      body: { reason: 'Blurred.', uploaded_at: UPLOADED_AT },
    })
  })

  it.each([
    ['already_reviewed', 'This certificate is already verified.'],
    ['conflict', 'The consultancy has submitted a newer certificate since you opened this one.'],
  ])('a 409 %s reads as the server’s sentence and reads the row again', async (code, message) => {
    mockedPost.mockResolvedValue(refused(409, code, message))
    const { invalidate, wrapper } = setup()
    const { result } = renderHook(() => useRejectKyc(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ consultancyId: 'c1', reason: 'x', uploadedAt: UPLOADED_AT }).catch(() => {})
    })
    await waitFor(() => expect(result.current.error?.message).toBe(message))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['kyc', 'c1'] })
  })
})

describe('useVerifyKyc', () => {
  it.each([
    ['already_reviewed', 'This certificate was rejected and the consultancy has been told.'],
    ['conflict', 'The consultancy has submitted a newer certificate since you opened this one.'],
  ])('a 409 %s reads as the server’s sentence and reads the row again', async (code, message) => {
    mockedPost.mockResolvedValue(refused(409, code, message))
    const { invalidate, wrapper } = setup()
    const { result } = renderHook(() => useVerifyKyc(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ consultancyId: 'c1', uploadedAt: UPLOADED_AT }).catch(() => {})
    })
    await waitFor(() => expect(result.current.error?.message).toBe(message))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['kyc', 'c1'] })
  })
})

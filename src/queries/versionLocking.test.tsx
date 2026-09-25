import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// Optimistic locking (contract gate 7, BR §3.6, Wave 3 plan §7 item 4): a PATCH that carries the
// `version` last read gets refused with 409 `version_conflict` if it's stale, instead of silently
// overwriting someone else's save. These pin that the console's own mutation hooks actually SEND
// it when the caller passes one — the part a UI-level test can't see once the PATCH body is
// built.
vi.mock('@/api/client', () => ({ api: { PATCH: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useUpdatePlanTemplate, useUpdateStep } from './plans'
import { useUpdateFormTemplate } from './formTemplates'

const mockedPatch = vi.mocked(api.PATCH)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  mockedPatch.mockReset()
  mockedPatch.mockResolvedValue({ data: {}, error: undefined } as never)
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('version sent on PATCH', () => {
  it('PATCH /steps/{id} (Plan Editor) carries version when the caller passes one', async () => {
    const { result } = renderHook(() => useUpdateStep('client-1'), { wrapper })
    await result.current.mutateAsync({ stepId: 'step-1', title: 'Renamed', version: 4 })
    expect(mockedPatch).toHaveBeenCalledWith(
      '/steps/{id}',
      expect.objectContaining({ body: expect.objectContaining({ version: 4 }) }),
    )
  })

  it('PATCH /plan-templates/{id} carries version when the caller passes one', async () => {
    const { result } = renderHook(() => useUpdatePlanTemplate(), { wrapper })
    await result.current.mutateAsync({ id: 'template-1', name: 'Renamed', version: 2 })
    expect(mockedPatch).toHaveBeenCalledWith(
      '/plan-templates/{id}',
      expect.objectContaining({ body: expect.objectContaining({ version: 2 }) }),
    )
  })

  it('PATCH /form-templates/{id} carries version when the caller passes one', async () => {
    const { result } = renderHook(() => useUpdateFormTemplate('form-1'), { wrapper })
    await result.current.mutateAsync({ name: 'Renamed', version: 7 })
    expect(mockedPatch).toHaveBeenCalledWith(
      '/form-templates/{id}',
      expect.objectContaining({ body: expect.objectContaining({ version: 7 }) }),
    )
  })

  it('omits version entirely when the caller has none yet (a brand new edit)', async () => {
    const { result } = renderHook(() => useUpdateStep('client-1'), { wrapper })
    await result.current.mutateAsync({ stepId: 'step-1', title: 'Renamed' })
    const call = mockedPatch.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }]
    expect(call[1].body.version).toBeUndefined()
  })
})

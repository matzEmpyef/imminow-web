import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// Since 2026-10-10 the server REQUIRES `version` on every edit of a versioned record: a missing one
// is refused 400 (`details.fields.version`), a stale one is 409. These pin, hook by hook, that the
// console sends the version it read and that a save with none never leaves the browser.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }))
vi.mock('./standing', () => ({ refreshStanding: vi.fn() }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { MISSING_VERSION_NOTICE } from '@/lib/staleEdit'
import { useUpdateAd } from './adsAdmin'
import { useAssignClient, useSetClientBranch, useSetFinalizedCountry } from './clients'
import { useUpdateConsultancyProfile } from './consultancy'
import { useUpdateCourse } from './courseSuggestions'
import { useUpdateEmployee } from './staff'
import { useUpdateEvent } from './eventsAdmin'
import { useUpdateFormTemplate } from './formTemplates'
import { useUpdatePlanTemplate, useUpdateStep } from './plans'

const mockedPatch = vi.mocked(api.PATCH)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  mockedPatch.mockReset()
  mockedPatch.mockResolvedValue({ data: {}, error: undefined } as never)
  useAuthStore.setState({ accessToken: 'test-token' })
})

type Case = {
  route: string
  /** Runs the hook's save with the given version (undefined = the record came without one). */
  save: (version: number | undefined) => Promise<unknown>
}

function hookCase(
  route: string,
  use: (version: number | undefined) => (v: number | undefined) => Promise<unknown>,
): Case {
  return {
    route,
    save: (version) => {
      const { result } = renderHook(() => use(version), { wrapper })
      return result.current(version)
    },
  }
}

const cases: Case[] = [
  hookCase('/ads/{id}', (v) => {
    const m = useUpdateAd('ad-1', v)
    return () => m.mutateAsync({ active: false })
  }),
  hookCase('/clients/{id}/branch', () => {
    const m = useSetClientBranch()
    return (v) => m.mutateAsync({ id: 'c-1', branchId: 'b-1', version: v })
  }),
  hookCase('/clients/{id}/finalized-country', () => {
    const m = useSetFinalizedCountry()
    return (v) => m.mutateAsync({ id: 'c-1', country: 'Canada', version: v })
  }),
  hookCase('/clients/{id}/assign', (v) => {
    const m = useAssignClient('c-1', v)
    return () => m.mutateAsync('emp-1')
  }),
  hookCase('/consultancies/me', (v) => {
    const m = useUpdateConsultancyProfile(v)
    return () => m.mutateAsync({ description: 'Hello' })
  }),
  hookCase('/courses/{id}', (v) => {
    const m = useUpdateCourse('course-1', v)
    return () => m.mutateAsync({ name: 'Renamed' })
  }),
  hookCase('/events/{id}', (v) => {
    const m = useUpdateEvent('event-1', v)
    return () => m.mutateAsync({ listed: false })
  }),
  hookCase('/staff/employees/{id}', (v) => {
    const m = useUpdateEmployee('emp-1', v)
    return () => m.mutateAsync({ first_name: 'Asha' })
  }),
  hookCase('/form-templates/{id}', () => {
    const m = useUpdateFormTemplate('form-1')
    return (v) => m.mutateAsync({ name: 'Renamed', version: v })
  }),
  hookCase('/plan-templates/{id}', () => {
    const m = useUpdatePlanTemplate()
    return (v) => m.mutateAsync({ id: 't-1', name: 'Renamed', version: v })
  }),
  hookCase('/steps/{id}', () => {
    const m = useUpdateStep('c-1')
    return (v) => m.mutateAsync({ stepId: 's-1', title: 'Renamed', version: v })
  }),
]

describe.each(cases)('PATCH $route', ({ route, save }) => {
  it('sends the version it read', async () => {
    await save(6)
    expect(mockedPatch).toHaveBeenCalledWith(
      route,
      expect.objectContaining({ body: expect.objectContaining({ version: 6 }) }),
    )
  })

  it('does not send a save that has no version, and says why', async () => {
    await expect(save(undefined)).rejects.toThrow(MISSING_VERSION_NOTICE)
    expect(mockedPatch).not.toHaveBeenCalled()
  })
})

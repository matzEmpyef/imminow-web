import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// Phase 5 cleanup (2026-09-24): three mutations invalidated a key no query actually uses, so
// the screen they were meant to refresh stayed stale until it went stale on its own. What is worth
// pinning is the BEHAVIOUR, not the key literals: with the real reading hook mounted, a successful
// mutation must make that hook fetch again. A key typo on either side fails these.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useApplicantAllocationQueue } from './applicantAllocation'
import { useResolveDispute } from './disputes'
import { useCollegeDetail } from './adminColleges'
import { useUpdateFieldOfStudy } from './fieldsOfStudy'
import { useCourse, useUpdateCourse } from './courseSuggestions'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)
const mockedPatch = vi.mocked(api.PATCH)

function getsTo(path: string) {
  return (mockedGet.mock.calls as unknown as unknown[][]).filter((call) => call[0] === path).length
}

/** Mounts `read` and `write` on one client, waits for the read, runs `mutate`, and resolves once
 * the read has fetched again. Times out (fails) if the mutation never invalidated it. */
async function expectRefetch<W>(
  path: string,
  read: () => { isSuccess: boolean },
  write: () => W,
  mutate: (w: W) => Promise<unknown>,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => ({ read: read(), write: write() }), { wrapper })
  await waitFor(() => expect(result.current.read.isSuccess).toBe(true))
  const before = getsTo(path)
  await act(async () => {
    await mutate(result.current.write)
  })
  await waitFor(() => expect(getsTo(path)).toBeGreaterThan(before))
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  mockedPatch.mockReset()
  mockedGet.mockResolvedValue({ data: {}, error: undefined } as never)
  mockedPost.mockResolvedValue({ data: {}, error: undefined } as never)
  mockedPatch.mockResolvedValue({ data: {}, error: undefined } as never)
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('mutation invalidations reach the query they mean to refresh', () => {
  it('resolving a dispute refreshes the applicant allocation queue', async () => {
    await expectRefetch(
      '/applicant-allocation-queue',
      () => useApplicantAllocationQueue(),
      () => useResolveDispute(),
      (w) => w.mutateAsync({ id: 'd1', action: 'reallocate' as never, resolutionNote: 'note' }),
    )
  })

  it('renaming a field of study refreshes the open college detail', async () => {
    await expectRefetch(
      '/colleges/{id}',
      () => useCollegeDetail('c1'),
      () => useUpdateFieldOfStudy(),
      (w) => w.mutateAsync({ id: 'f1', name: 'Renamed' }),
    )
  })

  it('editing a course refreshes the single-course view', async () => {
    await expectRefetch(
      '/courses/{id}',
      () => useCourse('course-1'),
      () => useUpdateCourse('course-1'),
      (w) => w.mutateAsync({ name: 'Renamed' } as never),
    )
  })

  it('editing a course refreshes the college detail it is listed on', async () => {
    await expectRefetch(
      '/colleges/{id}',
      () => useCollegeDetail('c1'),
      () => useUpdateCourse('course-1'),
      (w) => w.mutateAsync({ name: 'Renamed' } as never),
    )
  })
})

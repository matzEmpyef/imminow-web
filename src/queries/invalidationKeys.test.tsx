import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// Phase 5 cleanup (2026-09-24): three mutations invalidated a key no query actually uses, so
// the screen they were meant to refresh stayed stale until it went stale on its own. What is worth
// pinning is the BEHAVIOUR, not the key literals: with the real reading hook mounted, a successful
// mutation must make that hook fetch again. A key typo on either side fails these.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useApplicantAllocationQueue } from './applicantAllocation'
import { useResolveDispute } from './disputes'
import { useCollegeDetail } from './adminColleges'
import { useUpdateFieldOfStudy } from './fieldsOfStudy'
import { useCourse, useUpdateCourse } from './courseSuggestions'
import { useActivityFeed } from './activity'
import {
  useAssignClient,
  useClients,
  useCloseClient,
  useReopenClientCase,
  useSendClientMessage,
  useSetClientBranch,
  useTransferApplicant,
} from './clients'
import { useRecordCommissionPayment } from './commission'
import { useVoidInstallment } from './commissionEntries'
import { useConversations } from './conversations'
import { useDashboard } from './dashboard'
import { useFinanceSummary } from './financeDashboard'
import { useAllocateLead, useCloseLead, useLeads, useReopenLead, useSendLeadMessage } from './leads'
import { useEmployee, useUpdateBranch } from './staff'
import { useDeleteTag } from './tags'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)
const mockedPatch = vi.mocked(api.PATCH)
const mockedDelete = vi.mocked(api.DELETE)

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
  mockedDelete.mockReset()
  mockedDelete.mockResolvedValue({ data: undefined, error: undefined } as never)
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

// Review F-156, the part approved for now: screens that were NOT refreshed when they should be.
// Same test as above for each: with the screen's own read mounted, the save must make it fetch
// again. Each of these failed before the fix (the save refreshed the lead or client lists only).
describe('a lead or case changing hands or standing refreshes the screens that show it', () => {
  const READERS = {
    'the dashboard': ['/dashboard', () => useDashboard('consultancy')],
    'the chat drawer': ['/conversations', () => useConversations()],
    'the Activity queue': ['/activity-feed', () => useActivityFeed()],
  } as const

  const SAVES = {
    'assigning a client': [() => useAssignClient('c1'), (w: { mutateAsync: (v: never) => Promise<unknown> }) => w.mutateAsync('e2' as never)],
    "changing a client's branch": [() => useSetClientBranch(), (w: { mutateAsync: (v: never) => Promise<unknown> }) => w.mutateAsync({ id: 'c1', branchId: 'b2' } as never)],
    'closing a case': [() => useCloseClient(), (w: { mutateAsync: (v: never) => Promise<unknown> }) => w.mutateAsync({ id: 'c1', reason: 'Lost contact' } as never)],
    'reopening a case': [() => useReopenClientCase(), (w: { mutateAsync: (v: never) => Promise<unknown> }) => w.mutateAsync('c1' as never)],
    'transferring an applicant': [() => useTransferApplicant('c1'), (w: { mutateAsync: (v: never) => Promise<unknown> }) => w.mutateAsync({ newConsultancyId: 'x', reason: 'Moved city', transferCode: 'ABC123' } as never)],
    'assigning a lead': [() => useAllocateLead(), (w: { mutateAsync: (v: never) => Promise<unknown> }) => w.mutateAsync({ id: 'l1', employeeId: 'e2' } as never)],
    'closing a lead': [() => useCloseLead(), (w: { mutateAsync: (v: never) => Promise<unknown> }) => w.mutateAsync({ id: 'l1', reason: 'No reply' } as never)],
    'reopening a lead': [() => useReopenLead(), (w: { mutateAsync: (v: never) => Promise<unknown> }) => w.mutateAsync('l1' as never)],
  } as const

  const cases = Object.entries(SAVES).flatMap(([save, [write, mutate]]) =>
    Object.entries(READERS).map(([screen, [path, read]]) => ({ save, screen, path, read, write, mutate })),
  )

  it.each(cases)('$save refreshes $screen', async ({ path, read, write, mutate }) => {
    await expectRefetch(path, read, write as () => { mutateAsync: (v: never) => Promise<unknown> }, mutate)
  })
})

describe('other saves that left a screen stale', () => {
  it("sending a client message refreshes the chat drawer's preview", async () => {
    await expectRefetch(
      '/conversations',
      () => useConversations(),
      () => useSendClientMessage('c1'),
      (w) => w.mutateAsync('Hello'),
    )
  })

  it("sending a lead message refreshes the chat drawer's preview", async () => {
    await expectRefetch(
      '/conversations',
      () => useConversations(),
      () => useSendLeadMessage('l1'),
      (w) => w.mutateAsync('Hello'),
    )
  })

  it.each([
    ['the leads list', '/leads', () => useLeads({})],
    ['the clients list', '/clients', () => useClients({})],
  ] as const)('deleting a tag refreshes %s, which showed the tag on its rows', async (_name, path, read) => {
    await expectRefetch(path, read, () => useDeleteTag(), (w) => w.mutateAsync('t1'))
  })

  it.each([
    ['the leads list', '/leads', () => useLeads({})],
    ['the clients list', '/clients', () => useClients({})],
    // Every roster read shares the `employees` key prefix; one row stands for them here.
    ['the employee records', '/staff/employees/{id}', () => useEmployee('e1')],
  ] as const)('renaming a branch refreshes %s, which named the branch', async (_name, path, read) => {
    await expectRefetch(path, read, () => useUpdateBranch('b1'), (w) => w.mutateAsync({ name: 'Kochi Central' } as never))
  })

  it('recording a commission payment refreshes the finance dashboard', async () => {
    await expectRefetch(
      '/commission/finance/summary',
      () => useFinanceSummary(),
      () => useRecordCommissionPayment(),
      (w) => w.mutateAsync({ commission_entry_id: 'ce1', amount: 100, idempotencyKey: 'k1' }),
    )
  })

  // These invalidated `['finance-dashboard']`, a key no query has: the dashboard was never told.
  it('voiding an instalment refreshes the finance dashboard', async () => {
    await expectRefetch(
      '/commission/finance/summary',
      () => useFinanceSummary(),
      () => useVoidInstallment('c1'),
      (w) => w.mutateAsync({ entryId: 'ce1', installmentId: 'i1', reason: 'Entered twice', idempotencyKey: 'k1' } as never),
    )
  })

  it('no save names a finance dashboard key that no query has', () => {
    const sources = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const offenders = Object.entries(sources)
      .filter(([path, text]) => !path.includes('.test.') && text.includes("['finance-dashboard']"))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})

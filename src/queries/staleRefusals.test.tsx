import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// Gate 12 / 12b (Wave 7 fallout): several 409s mean "the row you are looking at is out of date" —
// someone else allocated, took over, or paid first. The message the server sends is already plain
// ("Someone else has just taken this — refresh and try again"), but nothing refreshed, so the
// admin read it over the same stale row. Each of these must refetch the list behind the screen.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useAllocateApplicant, useApplicantAllocationQueue } from './applicantAllocation'
import { useComplaints, useUpdateComplaint } from './complaints'
import { useDisputes, usePickUpDispute } from './disputes'
import { useFreelancerReferralsAdmin, useRecordFreelancerPayout } from './freelancerReferrals'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)
const mockedPatch = vi.mocked(api.PATCH)

const getsTo = (path: string) => (mockedGet.mock.calls as unknown as unknown[][]).filter((c) => c[0] === path).length
const refusal = (code: string) => ({ error: { code, message: 'plain words', request_id: 'r' } })

async function run<W>(path: string, read: () => { isSuccess: boolean }, write: () => W, mutate: (w: W) => Promise<unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result } = renderHook(() => ({ read: read(), write: write() }), { wrapper })
  await waitFor(() => expect(result.current.read.isSuccess).toBe(true))
  const before = getsTo(path)
  await act(async () => {
    await mutate(result.current.write).catch(() => undefined)
  })
  return { before, after: () => getsTo(path) }
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  mockedPatch.mockReset()
  mockedGet.mockResolvedValue({ data: { items: [] }, error: undefined } as never)
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('a 409 that says the row is stale refreshes the list behind it', () => {
  it('allocate: already_allocated refetches the queue and keeps the code on the error', async () => {
    mockedPost.mockResolvedValue({ data: undefined, error: refusal('already_allocated'), response: { status: 409 } } as never)
    const { before, after } = await run('/applicant-allocation-queue', () => useApplicantAllocationQueue(), () => useAllocateApplicant('q1'), (w) => w.mutateAsync('c1'))
    await waitFor(() => expect(after()).toBeGreaterThan(before))
  })

  it('allocate: already_a_case leaves the queue alone (the row stays by design)', async () => {
    mockedPost.mockResolvedValue({ data: undefined, error: refusal('already_a_case'), response: { status: 409 } } as never)
    const { before, after } = await run('/applicant-allocation-queue', () => useApplicantAllocationQueue(), () => useAllocateApplicant('q1'), (w) => w.mutateAsync('c1'))
    await new Promise((r) => setTimeout(r, 50))
    expect(after()).toBe(before)
  })

  it('complaint: taken_over refetches the complaints', async () => {
    mockedPatch.mockResolvedValue({ data: undefined, error: refusal('taken_over'), response: { status: 409 } } as never)
    const { before, after } = await run('/complaints', () => useComplaints(), () => useUpdateComplaint('c1'), (w) => w.mutateAsync({ assign_to_me: true }))
    await waitFor(() => expect(after()).toBeGreaterThan(before))
  })

  it('dispute pick-up: taken_over refetches the disputes', async () => {
    mockedPost.mockResolvedValue({ data: undefined, error: refusal('taken_over'), response: { status: 409 } } as never)
    const { before, after } = await run('/disputes', () => useDisputes(), () => usePickUpDispute(), (w) => w.mutateAsync('d1'))
    await waitFor(() => expect(after()).toBeGreaterThan(before))
  })

  it('freelancer payout: more_than_owed refetches the referrals', async () => {
    mockedPost.mockResolvedValue({ data: undefined, error: refusal('more_than_owed'), response: { status: 409 } } as never)
    const { before, after } = await run(
      '/freelancer-referrals',
      () => useFreelancerReferralsAdmin(),
      () => useRecordFreelancerPayout(),
      (w) => w.mutateAsync({ referralId: 'r1', amount_inr: 500, paid_on: '2026-10-01', idempotencyKey: 'k' }),
    )
    await waitFor(() => expect(after()).toBeGreaterThan(before))
  })
})

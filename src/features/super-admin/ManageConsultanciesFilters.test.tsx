import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-314: Manage Consultancies keeps its filters in the page address (a refresh or a shared
// link keeps them), an unverified account is badged by what is true of it ("KYC not verified": the
// list cannot tell "nothing uploaded" from "awaiting review"), and verifying a certificate refreshes
// the Needs attention count.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useMe } from '@/queries/me'
import { useVerifyKyc } from '@/queries/kyc'
import { meAnswered, platformMe } from '@/test/me'
import { ManageConsultanciesPage } from './ManageConsultanciesPage'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

const ROW = {
  id: 'c1', name: 'Northwind Education', kind: 'consultancy', country: 'India', city: 'Pune', active: true,
  kyc_verified: false, tier: 'business', seat_limit: 10, seats_used: 4, active_applicants: 12, subscription_status: 'active',
}

function Address() {
  const location = useLocation()
  return <p data-testid="address">{location.search}</p>
}

function renderPage(address: string) {
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ consultancy_approval: true })))
  mockedGet.mockResolvedValue({
    data: {
      items: [ROW],
      meta: { next_cursor: null, total: 1 },
      kind_counts: { consultancy: 1, institute: 0 },
      tier_counts: { starter: 0, business: 1, ultimate: 0 },
    },
    error: undefined,
  } as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <Address />
        <ManageConsultanciesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
})

describe('Manage Consultancies filters in the address', () => {
  it('writes a chosen filter to the address, and starts from one that is already there', async () => {
    renderPage('/admin/consultancies?tier=business&manage=c9')
    expect(await screen.findByText('Northwind Education')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveValue('business')

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'kyc_pending' } })
    await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent('status=kyc_pending'))
    // What was already there stays.
    expect(screen.getByTestId('address')).toHaveTextContent('tier=business')
    expect(screen.getByTestId('address')).toHaveTextContent('manage=c9')
  })

  it('turns the old ?kyc=pending link into the Status filter in the address', async () => {
    renderPage('/admin/consultancies?kyc=pending')
    expect(await screen.findByText('Northwind Education')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent('?status=kyc_pending'))
    expect(screen.getByTestId('address')).not.toHaveTextContent('kyc=pending')
  })

  it('badges an unverified account as not verified, not as pending', async () => {
    renderPage('/admin/consultancies')
    expect(await screen.findByText('KYC not verified')).toBeInTheDocument()
    expect(screen.queryByText('KYC pending')).not.toBeInTheDocument()
  })
})

describe('verifying a certificate', () => {
  it('refreshes the Needs attention count with the lists', async () => {
    mockedPost.mockResolvedValue({ data: { status: 'verified' }, error: undefined, response: { status: 200 } } as never)
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useVerifyKyc(), { wrapper })
    await act(() => result.current.mutateAsync({ consultancyId: 'c1', uploadedAt: '2026-10-08T08:15:00Z' }))
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['admin-attention'])
    expect(keys).toContainEqual(['admin-consultancies'])
    // Review F-207: the request names the certificate that was reviewed.
    expect(mockedPost.mock.calls[0][0]).toBe('/consultancies/{id}/kyc/verify')
    expect((mockedPost.mock.calls[0][1] as { body: unknown }).body).toEqual({ uploaded_at: '2026-10-08T08:15:00Z' })
  })

  it('on a newer certificate (409 conflict) reads the KYC row again and says to review it', async () => {
    mockedPost.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'conflict', message: 'The consultancy has submitted a newer certificate.' } },
      response: { status: 409 },
    } as never)
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useVerifyKyc(), { wrapper })
    const error = await act(() =>
      result.current
        .mutateAsync({ consultancyId: 'c1', uploadedAt: '2026-10-08T08:15:00Z' })
        .catch((e: unknown) => e as Error),
    )
    expect((error as Error).message).toBe('A newer certificate was submitted. Please review it.')
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toEqual([['kyc', 'c1']])
  })
})

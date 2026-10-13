import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-314: Manage Consultancies keeps its filters in the page address (a refresh or a shared
// link keeps them), an account's KYC is badged by where it stands (`kyc_status` on the row since
// 2026-10-08: verified, pending review, rejected, or no certificate), and verifying a certificate
// refreshes the Needs attention count.
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

function renderPage(address: string, row: Record<string, unknown> = {}) {
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ consultancy_approval: true })))
  mockedGet.mockResolvedValue({
    data: {
      items: [{ ...ROW, ...row }],
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

  it.each(['lapsed', 'grace', 'expiring'])(
    'turns the Needs attention ?subscription=%s link into the Status filter',
    async (value) => {
      renderPage(`/admin/consultancies?subscription=${value}`)
      expect(await screen.findByText('Northwind Education')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue(value)
      await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent(`?status=${value}`))
      expect(screen.getByTestId('address')).not.toHaveTextContent('subscription=')
    },
  )

  it('turns the Needs attention ?upgrade=open link into the Upgrade requested filter, and asks the server for it', async () => {
    renderPage('/admin/consultancies?upgrade=open')
    expect(await screen.findByText('Northwind Education')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('upgrade_requested')
    await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent('?status=upgrade_requested'))
    expect(screen.getByTestId('address')).not.toHaveTextContent('upgrade=open')
    await waitFor(() =>
      expect(
        (mockedGet.mock.calls as unknown[][]).some(
          ([path, init]) =>
            path === '/consultancies' &&
            (init as { params: { query: { status?: string } } }).params.query.status === 'upgrade_requested',
        ),
      ).toBe(true),
    )
  })

  it('offers Upgrade requested in the Status filter', async () => {
    renderPage('/admin/consultancies')
    expect(await screen.findByText('Northwind Education')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'upgrade_requested' } })
    await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent('status=upgrade_requested'))
  })

  it('names the pending filter for what it holds, apart from KYC rejected (review 2.115)', async () => {
    renderPage('/admin/consultancies')
    expect(await screen.findByText('Northwind Education')).toBeInTheDocument()
    const status = screen.getByRole('combobox', { name: 'Status' })
    const options = Array.from(status.querySelectorAll('option')).map((o) => [o.value, o.textContent])
    expect(options).toContainEqual(['kyc_pending', 'KYC pending review'])
    expect(options).toContainEqual(['kyc_rejected', 'KYC rejected'])
    expect(options).not.toContainEqual(['kyc_pending', 'KYC to verify'])
  })

  it('offers KYC rejected in the Status filter, and asks the server for it', async () => {
    renderPage('/admin/consultancies')
    expect(await screen.findByText('Northwind Education')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'kyc_rejected' } })
    await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent('status=kyc_rejected'))
    await waitFor(() =>
      expect(
        (mockedGet.mock.calls as unknown[][]).some(
          ([path, init]) =>
            path === '/consultancies' &&
            (init as { params: { query: { status?: string } } }).params.query.status === 'kyc_rejected',
        ),
      ).toBe(true),
    )
  })

  it.each([
    ['verified', 'KYC verified'],
    ['pending', 'KYC pending review'],
    ['rejected', 'KYC rejected'],
    ['not_submitted', 'No certificate'],
  ])('badges a row whose kyc_status is %s as "%s"', async (kycStatus, label) => {
    renderPage('/admin/consultancies', { kyc_status: kycStatus })
    const row = (await screen.findByText('Northwind Education')).closest('tr')!
    expect(within(row).getByText(label)).toBeInTheDocument()
    expect(screen.queryByText('KYC not verified')).not.toBeInTheDocument()
  })

  it('shows no KYC badge when the row carries no kyc_status', async () => {
    renderPage('/admin/consultancies')
    const row = (await screen.findByText('Northwind Education')).closest('tr')!
    expect(within(row).queryByText(/KYC|No certificate/)).not.toBeInTheDocument()
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
    // The server's own sentence is what the reviewer reads.
    expect((error as Error).message).toBe('The consultancy has submitted a newer certificate.')
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toEqual([['kyc', 'c1']])
  })
})

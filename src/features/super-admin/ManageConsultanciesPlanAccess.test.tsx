import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-129/F-130: plan data (plan, subscription, seats, active applicants, per-plan counts)
// is sent only to platform accounts holding `consultancy_approval` or `finance`. For anyone else
// the list shows no plan column, offers no Plan or Status filter, and sends neither.
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
import { meAnswered, platformMe } from '@/test/me'
import { ManageConsultanciesPage } from './ManageConsultanciesPage'

const mockedGet = vi.mocked(api.GET)

const PUBLIC_ROW = { id: 'c1', name: 'Northwind Education', kind: 'consultancy', country: 'India', city: 'Pune', active: true, kyc_verified: true }
const FULL_ROW = { ...PUBLIC_ROW, tier: 'business', seat_limit: 10, seats_used: 4, active_applicants: 12, subscription_status: 'active' }

function renderPage(permissions: Record<string, boolean>, address = '/admin/consultancies') {
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(platformMe(permissions)))
  const full = permissions.consultancy_approval || permissions.finance
  mockedGet.mockResolvedValue({
    data: {
      items: [full ? FULL_ROW : PUBLIC_ROW],
      meta: { next_cursor: null, total: 1 },
      kind_counts: { consultancy: 1, institute: 0 },
      ...(full ? { tier_counts: { starter: 0, business: 1, ultimate: 0 } } : {}),
    },
    error: undefined,
  } as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <ManageConsultanciesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function listQuery() {
  const call = (mockedGet.mock.calls as unknown[][]).find((c) => c[0] === '/consultancies') ?? []
  return (call[1] as { params: { query: Record<string, unknown> } }).params.query
}

beforeEach(() => {
  mockedGet.mockReset()
})

describe('Manage Consultancies: who sees plan data', () => {
  it('shows the plan columns, counts and filters to an account that approves consultancies', async () => {
    renderPage({ consultancy_approval: true })
    expect(await screen.findByText('Northwind Education')).toBeInTheDocument()

    for (const header of ['Plan', 'Subscription', 'Seats', 'Active applicants']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(header) })).toBeInTheDocument()
    }
    expect(screen.getByText('Starter', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument()
  })

  it('shows them to a finance account too', async () => {
    renderPage({ finance: true })
    expect(await screen.findByText('Northwind Education')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Seats/ })).toBeInTheDocument()
  })

  it('offers no plan column, count, filter or sort to any other platform account, and sends none', async () => {
    // `?status=` arrives on links from Needs attention; without the permission it is not sent.
    renderPage({ blog: true }, '/admin/consultancies?status=never_billed')
    expect(await screen.findByText('Northwind Education')).toBeInTheDocument()

    for (const header of ['Plan', 'Subscription', 'Seats', 'Active applicants']) {
      expect(screen.queryByRole('columnheader', { name: new RegExp(header) })).not.toBeInTheDocument()
    }
    expect(screen.getByRole('columnheader', { name: /Name/ })).toBeInTheDocument()
    expect(screen.queryByText('Starter')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Plan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Type' })).toBeInTheDocument()

    await waitFor(() => expect(mockedGet).toHaveBeenCalled())
    const query = listQuery()
    expect(query.tier).toBeUndefined()
    expect(query.status).toBeUndefined()
  })
})

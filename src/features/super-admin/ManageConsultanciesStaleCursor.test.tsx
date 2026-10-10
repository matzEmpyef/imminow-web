import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The page links of `GET /consultancies` are sealed (owner's ruling 2026-10-09). When the server
// says a page link can no longer be used (400 `validation_failed` naming `cursor`) the list starts
// again from its first page, with no error on screen; every page link goes back to the server
// exactly as it was received.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))
vi.mock('@/features/auth/AdminShell', () => ({
  AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useMe } from '@/queries/me'
import { meAnswered, platformMe } from '@/test/me'
import { ManageConsultanciesPage } from './ManageConsultanciesPage'

const mockedGet = vi.mocked(api.GET)

// A sealed link carries characters a careless client would change.
const SEALED = 'eyJ2IjoxfQ==.a+b/c=.9f2e'

const row = (id: string, name: string) => ({
  id,
  name,
  kind: 'consultancy',
  country: 'India',
  city: 'Pune',
  active: true,
  kyc_verified: false,
  tier: 'business',
  seat_limit: 10,
  seats_used: 4,
  active_applicants: 12,
  subscription_status: 'active',
})
const counts = { kind_counts: { consultancy: 2, institute: 0 }, tier_counts: { starter: 0, business: 2, ultimate: 0 } }

function cursorsAsked() {
  return (mockedGet.mock.calls as unknown[][])
    .filter(([path]) => path === '/consultancies')
    .map(([, init]) => (init as { params: { query: { cursor?: string } } }).params.query.cursor)
}

function renderPage() {
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ consultancy_approval: true })))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/consultancies']}>
        <ManageConsultanciesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockedGet.mockReset()
})

describe('Manage Consultancies, a page link the server no longer accepts', () => {
  it('starts again from the first page without showing an error', async () => {
    const sentence = 'That page link can no longer be used. Start again from the first page.'
    mockedGet.mockImplementation((async (_path: string, init: { params: { query: { cursor?: string } } }) => {
      if (init.params.query.cursor === SEALED) {
        return {
          data: undefined,
          error: {
            error: { code: 'validation_failed', message: sentence, details: { fields: { cursor: sentence } }, status: 400 },
          },
        }
      }
      return {
        data: { items: [row('c1', 'Northwind Education')], meta: { next_cursor: SEALED, total: 2 }, ...counts },
        error: undefined,
      }
    }) as never)

    renderPage()
    expect(await screen.findByText('Northwind Education')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    // The link goes back exactly as it was received ...
    await waitFor(() => expect(cursorsAsked()).toContain(SEALED))
    // ... is refused, and the list is read again from the first page (no cursor) ...
    await waitFor(() => expect(cursorsAsked().filter((c) => c === undefined).length).toBeGreaterThanOrEqual(2))
    expect(await screen.findByText('Northwind Education')).toBeInTheDocument()
    // ... with no error in sight, and nothing left to go back to.
    expect(screen.queryByText('Could not load consultancies.')).not.toBeInTheDocument()
    expect(screen.queryByText(/page link can no longer/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  })
})

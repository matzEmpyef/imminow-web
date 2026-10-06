import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Changing an exchange rate is Finance's alone (the server refuses anyone without the `finance`
// permission). The editor therefore lives in Finance → Exchange Rates; Settings still lists the
// rates but is read-only unless the viewer also holds `finance`. Pinned here: who sees the Finance
// link, who gets edit controls where, and that the >10% confirmation survived the move.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), PUT: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))
vi.mock('@/queries/adminDashboard', () => ({ useAdminAttention: () => ({ data: undefined }) }))
vi.mock('@/components/NotificationsDropdown', () => ({ NotificationsDropdown: () => null }))
// The real sidebar is not what is under test, only which links AdminShell hands it.
vi.mock('@/components/SidebarShell', () => ({
  SidebarShell: ({
    sections,
    children,
  }: {
    sections: { key: string; label: string; sidebarLinks: { label: string; path: string }[] }[]
    children: ReactNode
  }) => (
    <div>
      {sections.map((s) => (
        <nav key={s.key} aria-label={s.label}>
          {s.sidebarLinks.map((l) => (
            <a key={l.path} href={l.path}>
              {l.label}
            </a>
          ))}
        </nav>
      ))}
      {children}
    </div>
  ),
}))

import { api } from '@/api/client'
import { AdminShell } from '@/features/auth/AdminShell'
import { useAuthStore } from '@/stores/authStore'
import { useMe } from '@/queries/me'
import { meAnswered, platformMe } from '@/test/me'
import { CatalogSettingsPage } from './CatalogSettingsPage'
import { ExchangeRatesPage } from './ExchangeRatesPage'

const mockedGet = vi.mocked(api.GET)
const mockedPut = vi.mocked(api.PUT)

type Permissions = Record<string, boolean>

function signInAs(permissions: Permissions) {
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(platformMe(permissions)))
}

function renderPage(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPut.mockReset()
  mockedGet.mockImplementation((async (path: string) => {
    if (path === '/exchange-rates') {
      return {
        data: [
          { currency: 'INR', inr_per_unit: 1, updated_at: '2026-10-01T00:00:00Z' },
          { currency: 'CAD', inr_per_unit: 62, updated_at: '2026-10-01T00:00:00Z' },
        ],
        error: undefined,
      }
    }
    return { data: [], error: undefined }
  }) as never)
  mockedPut.mockResolvedValue({ data: {}, error: undefined } as never)
})

describe('Finance → Exchange Rates link', () => {
  const renderShell = () =>
    renderPage(
      <AdminShell>
        <p>page</p>
      </AdminShell>,
    )

  it('is offered to staff with the finance permission', () => {
    signInAs({ finance: true })
    renderShell()
    const link = within(screen.getByRole('navigation', { name: 'Finance' })).getByRole('link', {
      name: 'Exchange Rates',
    })
    expect(link).toHaveAttribute('href', '/admin/finance/exchange-rates')
  })

  it('is not offered to staff with only the catalog settings permission', () => {
    signInAs({ catalog_settings: true })
    renderShell()
    expect(screen.queryByRole('link', { name: 'Exchange Rates' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Finance' })).not.toBeInTheDocument()
  })
})

describe('Finance → Exchange Rates page', () => {
  it('is editable, and a change of more than 10% still asks before saving', async () => {
    signInAs({ finance: true })
    renderPage(<ExchangeRatesPage />)

    expect(await screen.findByRole('heading', { name: 'Exchange Rates' })).toBeInTheDocument()
    expect(screen.queryByText('Exchange rates are managed by the finance team.')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit CAD rate' }))
    const form = screen.getByRole('dialog', { name: 'Edit CAD Rate' })
    fireEvent.change(within(form).getByLabelText(/₹ per unit of this currency/), { target: { value: '6.2' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save Rate' }))

    expect(await screen.findByRole('dialog', { name: 'Change the CAD rate by −90%?' })).toBeInTheDocument()
    expect(mockedPut).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Add Currency' })).toBeInTheDocument()
  })
})

describe('Settings → Exchange Rates', () => {
  async function openRatesTab() {
    renderPage(<CatalogSettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Exchange Rates' }))
    return screen.findByText('CAD')
  }

  it('is read-only for staff without the finance permission', async () => {
    signInAs({ catalog_settings: true })
    await openRatesTab()
    expect(screen.getByText('Exchange rates are managed by the finance team.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit CAD rate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Currency' })).not.toBeInTheDocument()
  })

  it('stays editable for someone who holds both permissions', async () => {
    signInAs({ catalog_settings: true, finance: true })
    await openRatesTab()
    expect(screen.queryByText('Exchange rates are managed by the finance team.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit CAD rate' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Currency' })).toBeInTheDocument()
  })
})

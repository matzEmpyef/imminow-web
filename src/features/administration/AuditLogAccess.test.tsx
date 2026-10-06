import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// F-021 (console part): a consultancy's audit log holds every change made in it, with the
// personal data in each entry, and the server reads it to the Owner/Admin only. The console
// offered its link to every employee. Pinned here: the sidebar link is the admin's alone, and
// when the server answers 403 the page says "You don't have access" rather than "could not load".
// (The route's own gate is pinned beside the other gates, in features/auth/gates.test.tsx.)
vi.mock('@/api/client', () => ({ api: { GET: vi.fn() } }))
vi.mock('@/components/SidebarShell', () => ({
  SidebarShell: ({
    sections,
    children,
  }: {
    sections: { sidebarLinks?: { label: string; path: string }[] }[]
    children: ReactNode
  }) => (
    <div>
      <nav>
        {sections.flatMap((s) => (s.sidebarLinks ?? []).map((l) => <a key={l.path} href={l.path}>{l.label}</a>))}
      </nav>
      {children}
    </div>
  ),
}))
vi.mock('@/components/GlobalSearch', () => ({ GlobalSearch: () => null }))
vi.mock('@/components/FloatingChatWindow', () => ({ FloatingChatWindow: () => null }))
vi.mock('@/components/GlobalChatDrawer', () => ({ GlobalChatDrawer: () => null }))
vi.mock('@/components/NotificationsDropdown', () => ({ NotificationsDropdown: () => null }))
vi.mock('@/features/auth/SubscriptionBanner', () => ({ SubscriptionBanner: () => null }))
vi.mock('@/queries/activity', () => ({ useActivityFeed: () => ({ data: undefined }) }))
vi.mock('@/lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/features')>()),
  useFeatures: () => ({ data: { audit_log: true }, isLoading: false, isError: false }),
}))
vi.mock('@/lib/permissions', () => ({ usePermissionChecker: vi.fn() }))
vi.mock('@/lib/accountWords', () => ({
  useAccountWords: () => ({ isInstitute: false, org: 'consultancy', Org: 'Consultancy' }),
}))

import { api } from '@/api/client'
import { usePermissionChecker } from '@/lib/permissions'
import { useAuthStore } from '@/stores/authStore'
import { AppShell } from '@/features/auth/AppShell'
import { AuditLogPage } from './AuditLogPage'

const mockedGet = vi.mocked(api.GET)
const mockedChecker = vi.mocked(usePermissionChecker)

function signedInAs(who: { isAdmin: boolean }) {
  mockedChecker.mockReturnValue({
    // Every permission key granted, so only the admin flag can be what decides.
    can: () => true,
    isAdmin: who.isAdmin,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })
}

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  mockedGet.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('audit log link (F-021)', () => {
  it('is shown to the consultancy admin', () => {
    signedInAs({ isAdmin: true })
    renderWithClient(<AppShell>page</AppShell>)
    expect(screen.getByRole('link', { name: 'Audit Log' })).toHaveAttribute('href', '/administration/audit-log')
  })

  it('is not shown to any other employee, whatever permissions they hold', () => {
    signedInAs({ isAdmin: false })
    renderWithClient(<AppShell>page</AppShell>)
    expect(screen.queryByRole('link', { name: 'Audit Log' })).not.toBeInTheDocument()
    // The links their permissions do grant are still there.
    expect(screen.getByRole('link', { name: 'Employees' })).toBeInTheDocument()
  })
})

describe('audit log page (F-021)', () => {
  it('says "You don\'t have access to this page" when the server answers 403', async () => {
    signedInAs({ isAdmin: false })
    mockedGet.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'forbidden', message: 'The audit log is limited to the consultancy admin.' } },
      response: { status: 403 },
    } as never)
    renderWithClient(<AuditLogPage />)

    expect(await screen.findByText('You don’t have access to this page.')).toBeInTheDocument()
    expect(screen.queryByText('Could not load the audit log.')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('still reports any other failure as a failure to load', async () => {
    signedInAs({ isAdmin: true })
    mockedGet.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'internal', message: '' } },
      response: { status: 500 },
    } as never)
    renderWithClient(<AuditLogPage />)

    expect(await screen.findByText('Could not load the audit log.')).toBeInTheDocument()
    expect(screen.queryByText(/have access to this page/)).not.toBeInTheDocument()
  })

  it('shows the log to the admin', async () => {
    signedInAs({ isAdmin: true })
    mockedGet.mockResolvedValue({
      data: {
        items: [
          {
            id: 'a1',
            action_type: 'update',
            actor_name: 'Meera Pillai',
            entity_type: 'lead',
            entity_label: 'Arjun',
            area: 'leads',
            created_at: '2026-10-05T09:00:00Z',
          },
        ],
        meta: { next_cursor: null, total: 1 },
      },
      error: undefined,
      response: { status: 200 },
    } as never)
    renderWithClient(<AuditLogPage />)

    expect(await screen.findByText('Meera Pillai')).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-147 and the owner's rulings of 2026-10-06. Reopen is offered only where the server
// allows it: the `case_reopening` plan feature, and never on a case that closed because the
// student deleted their account. The two lists used to show the control on every closed row.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/features/auth/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))

import { api } from '@/api/client'
import { ClientsListPage } from '@/features/clients/ClientsListPage'
import { ActiveLeadsPage } from '@/features/sales/ActiveLeadsPage'
import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, staffMe } from '@/test/me'
import { canOfferCaseReopen, canOfferLeadReopen, leadClosedOnStudentSide } from './reopenRules'

const LEADS = [
  { id: 'l-open', name: 'Open Lead', status: 'active', origin: 'sentpo', tags: [], unread: 0 },
  { id: 'l-closed', name: 'Closed Lead', status: 'closed', origin: 'sentpo', tags: [], unread: 0 },
]
const student = (first: string) => ({ first_name: first, last_name: 'Case', email: `${first}@example.test` })
const CLIENTS = [
  { id: 'c-live', student: student('Live'), status: 'in_plan', tags: [] },
  { id: 'c-closed', student: student('Closed'), status: 'closed', close_sub_reason: 'lost_contact', tags: [] },
  { id: 'c-deleted', student: student('Deleted'), status: 'closed', close_sub_reason: 'account_deleted', tags: [] },
  { id: 'c-moved', student: student('Moved'), status: 'closed_switched', tags: [] },
]

function serve() {
  vi.mocked(api.GET).mockImplementation((async (path: string) => {
    const page = (items: unknown[]) => ({ data: { items, meta: { next_cursor: null, total: items.length } }, error: undefined })
    if (path === '/leads') return page(LEADS)
    if (path === '/clients') return page(CLIENTS)
    // Branches, tags and countries answer with a bare list; every other read is a page.
    if (['/staff/branches', '/tags', '/countries'].includes(path)) return { data: [], error: undefined }
    return page([])
  }) as never)
}

function renderPage(page: React.ReactNode, features: string[]) {
  vi.mocked(useMe).mockReturnValue(meAnswered(staffMe({ features, is_admin: true })))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useAuthStore.setState({ accessToken: 'token', refreshToken: 'refresh' })
  serve()
})

describe('the rules', () => {
  it('a lead: closed, and the plan includes reopening', () => {
    expect(canOfferLeadReopen({ status: 'closed' }, true)).toBe(true)
    expect(canOfferLeadReopen({ status: 'closed' }, false)).toBe(false)
    expect(canOfferLeadReopen({ status: 'active' }, true)).toBe(false)
    expect(canOfferLeadReopen({ status: 'converted' }, true)).toBe(false)
  })

  it('a case: closed, the plan includes reopening, not moved, and not closed by an account deletion', () => {
    expect(canOfferCaseReopen({ status: 'closed', close_sub_reason: 'lost_contact' }, true)).toBe(true)
    expect(canOfferCaseReopen({ status: 'closed', close_sub_reason: null }, true)).toBe(true)
    expect(canOfferCaseReopen({ status: 'closed', close_sub_reason: 'lost_contact' }, false)).toBe(false)
    expect(canOfferCaseReopen({ status: 'closed', close_sub_reason: 'account_deleted' }, true)).toBe(false)
    expect(canOfferCaseReopen({ status: 'closed_switched' }, true)).toBe(false)
    expect(canOfferCaseReopen({ status: 'in_plan' }, true)).toBe(false)
  })

  // The owner's lead rule cannot be applied yet: the contract's Lead says nothing about who
  // closed it or why. This pins the present, honest answer so the day the field exists the
  // change is made here, in one place, with this test rewritten.
  it('cannot yet tell a lead the student closed from one the consultancy closed', () => {
    expect(leadClosedOnStudentSide({ status: 'closed' })).toBe(false)
  })
})

describe('the leads list', () => {
  it('offers Reopen on a closed lead when the plan includes reopening', async () => {
    renderPage(<ActiveLeadsPage />, ['case_reopening'])
    expect(await screen.findByRole('button', { name: 'Reopen Closed Lead' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen Open Lead' })).not.toBeInTheDocument()
  })

  it('offers no Reopen at all on a plan without it', async () => {
    renderPage(<ActiveLeadsPage />, [])
    expect(await screen.findByText('Closed Lead')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Reopen / })).not.toBeInTheDocument()
  })
})

describe('the clients list', () => {
  it('offers Reopen on a closed case, but not one closed by an account deletion or moved away', async () => {
    renderPage(<ClientsListPage />, ['case_reopening'])
    expect(await screen.findByRole('button', { name: 'Reopen Closed Case' })).toBeInTheDocument()
    expect(screen.getByText('Deleted Case')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen Deleted Case' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen Moved Case' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen Live Case' })).not.toBeInTheDocument()
  })

  it('offers no Reopen at all on a plan without it', async () => {
    renderPage(<ClientsListPage />, [])
    expect(await screen.findByText('Closed Case')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Reopen / })).not.toBeInTheDocument()
  })
})

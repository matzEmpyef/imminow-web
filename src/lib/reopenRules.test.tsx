import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-147 and the owner's rulings of 2026-10-06. Reopen is offered only where the server
// allows it. A LEAD: exactly when the server says so on the lead (`can_reopen`), which is false
// for a lead the student closed, one that closed because they chose another consultancy, and on
// a plan without reopening. A CASE: the `case_reopening` plan feature, and never one that closed
// because the student deleted their account. The two lists used to show the control on every
// closed row.
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
import { canOfferCaseReopen, canOfferLeadReopen } from './reopenRules'

const LEADS = [
  { id: 'l-open', name: 'Open Lead', status: 'active', origin: 'sentpo', tags: [], unread: 0, can_reopen: false },
  { id: 'l-closed', name: 'Closed Lead', status: 'closed', origin: 'sentpo', tags: [], unread: 0, can_reopen: true, closed_by: 'consultancy', closed_reason_label: 'Lost contact' },
  // Closed by the student, or because they chose another consultancy: the server says no.
  { id: 'l-theirs', name: 'Student Closed', status: 'closed', origin: 'sentpo', tags: [], unread: 0, can_reopen: false, closed_by: 'student', closed_reason_label: 'The student ended this chat.' },
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
  it("a lead: the server's own answer, and nothing worked out here", () => {
    expect(canOfferLeadReopen({ can_reopen: true })).toBe(true)
    expect(canOfferLeadReopen({ can_reopen: false })).toBe(false)
    // A closed lead is not enough: who closed it is the server's to know.
    expect(canOfferLeadReopen({ status: 'closed', can_reopen: false } as never)).toBe(false)
    // No answer is not a yes.
    expect(canOfferLeadReopen({})).toBe(false)
    expect(canOfferLeadReopen({ can_reopen: null })).toBe(false)
    // A chat the student ended is never the consultancy's to reopen, whatever else says so.
    expect(canOfferLeadReopen({ can_reopen: true, closed_by: 'student' })).toBe(false)
    expect(canOfferLeadReopen({ can_reopen: true, closed_by: 'consultancy' })).toBe(true)
  })

  it('a case: closed, the plan includes reopening, not moved, and not closed by an account deletion', () => {
    expect(canOfferCaseReopen({ status: 'closed', close_sub_reason: 'lost_contact' }, true)).toBe(true)
    expect(canOfferCaseReopen({ status: 'closed', close_sub_reason: null }, true)).toBe(true)
    expect(canOfferCaseReopen({ status: 'closed', close_sub_reason: 'lost_contact' }, false)).toBe(false)
    expect(canOfferCaseReopen({ status: 'closed', close_sub_reason: 'account_deleted' }, true)).toBe(false)
    // Closed as under 16: Reopen is still offered, and the server's refusal says why it cannot.
    expect(canOfferCaseReopen({ status: 'closed', close_sub_reason: 'under_age' }, true)).toBe(true)
    expect(canOfferCaseReopen({ status: 'closed_switched' }, true)).toBe(false)
    expect(canOfferCaseReopen({ status: 'in_plan' }, true)).toBe(false)
  })
})

describe('the leads list', () => {
  it('offers Reopen on the closed lead the server says may be reopened, and on no other', async () => {
    renderPage(<ActiveLeadsPage />, ['case_reopening'])
    expect(await screen.findByRole('button', { name: 'Reopen Closed Lead' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen Open Lead' })).not.toBeInTheDocument()
    // Closed, on a plan with reopening, and still not offered: the student closed it.
    expect(screen.getByText('Student Closed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen Student Closed' })).not.toBeInTheDocument()
  })

  it('says why each closed lead closed, in the server’s own sentence', async () => {
    renderPage(<ActiveLeadsPage />, ['case_reopening'])
    expect(await screen.findByText('The student ended this chat.')).toBeInTheDocument()
    expect(screen.getByText('Lost contact')).toBeInTheDocument()
  })

  it("follows the server's answer, not the plan as this browser reads it", async () => {
    // The server's `can_reopen` already includes the plan; the console does not second-guess it.
    renderPage(<ActiveLeadsPage />, [])
    expect(await screen.findByRole('button', { name: 'Reopen Closed Lead' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen Student Closed' })).not.toBeInTheDocument()
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

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Lane w, the audit-log changes. On both logs (the consultancy's and the platform's):
//   - a reason can be the literal "[erased]": shown exactly so, with one line saying why;
//   - search no longer matches the words of a reason typed about a person: the hint says what it
//     does match;
//   - a freelancer entry's label is the person's current name only; the payout amount and the
//     referral code moved into `diff`, and are read out as plain lines.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn() } }))
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: () => ({ isInstitute: false, org: 'consultancy' }) }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { PlatformAuditLogPage } from '@/features/super-admin/PlatformAuditLogPage'
import { AUDIT_SEARCH_HINT, AuditEntryDetail } from './AuditEntryDetail'
import { AuditLogPage } from './AuditLogPage'

const mockedGet = vi.mocked(api.GET)

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    actor_id: 'e1',
    actor_name: 'Asha Nair',
    consultancy_id: 'c1',
    action_type: 'update',
    entity_type: 'client',
    entity_id: 'cl-1',
    entity_label: 'Deleted User',
    area: 'clients',
    diff: null,
    reason: null,
    created_at: '2026-10-06T09:00:00Z',
    ...overrides,
  }
}

let entries: ReturnType<typeof entry>[]

function auditCalls(path: string) {
  return (mockedGet.mock.calls as unknown[][])
    .filter((call) => call[0] === path)
    .map((call) => (call[1] as { params: { query: { search?: string; filter?: Record<string, string> } } }).params.query)
}

function renderPage(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockedGet.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  entries = [entry()]
  mockedGet.mockImplementation((async (path: string) => {
    if (path === '/audit-log' || path === '/audit-log/platform') {
      return { data: { items: entries, meta: { next_cursor: null, total: entries.length } }, error: undefined, response: { status: 200 } }
    }
    if (path === '/staff/employees') {
      return {
        data: {
          items: [
            { id: 'e1', active: true, user: { first_name: 'Asha', last_name: 'Nair', designation: 'Counsellor' } },
            { id: 'e2', active: false, user: { first_name: 'Dev', last_name: 'Shah', designation: null } },
          ],
          meta: { next_cursor: null, total: 2 },
        },
        error: undefined,
      }
    }
    return { data: { items: [], meta: { next_cursor: null } }, error: undefined }
  }) as never)
})

describe('an audit entry, opened', () => {
  it('shows an erased reason exactly as the server sends it, and says what it means', () => {
    render(<AuditEntryDetail entry={{ reason: '[erased]', diff: null }} />)
    expect(screen.getByText('[erased]', { exact: false })).toHaveTextContent('Reason: [erased]')
    expect(screen.getByText('This reason was removed when the person’s account was erased.')).toBeInTheDocument()
  })

  it('an ordinary reason has no such line', () => {
    render(<AuditEntryDetail entry={{ reason: 'Student asked to close the case.', diff: null }} />)
    expect(screen.getByText('Student asked to close the case.', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(/was erased/)).not.toBeInTheDocument()
  })

  it('reads out a freelancer payout amount from the diff, in rupees', () => {
    render(<AuditEntryDetail entry={{ reason: null, diff: { amount_inr: [null, 5000], referral_id: [null, 'ref-1'] } }} />)
    expect(screen.getByText('Amount:').closest('p')).toHaveTextContent('Amount: INR 5,000')
    // The whole recorded change is still there underneath.
    expect(screen.getByText(/"referral_id"/)).toBeInTheDocument()
  })

  it('reads out the referral code of an invite, and both codes when one replaced another', () => {
    const { rerender } = render(<AuditEntryDetail entry={{ reason: null, diff: { referral_code: [null, 'RAVI24'] } }} />)
    expect(screen.getByText('Referral code:').closest('p')).toHaveTextContent('Referral code: RAVI24')
    rerender(<AuditEntryDetail entry={{ reason: null, diff: { referral_code: ['RAVI24', 'RAVI25'] } }} />)
    expect(screen.getByText('Referral code:').closest('p')).toHaveTextContent('Referral code: RAVI24 → RAVI25')
  })

  it('an entry with neither says so', () => {
    render(<AuditEntryDetail entry={{ reason: null, diff: null }} />)
    expect(screen.getByText('No further detail recorded.')).toBeInTheDocument()
  })

  it('a diff with no fact it knows shows the change alone', () => {
    render(<AuditEntryDetail entry={{ reason: null, diff: { status: ['open', 'closed'] } }} />)
    expect(screen.queryByText('Amount:')).not.toBeInTheDocument()
    expect(screen.getByText(/"status"/)).toBeInTheDocument()
  })
})

describe.each([
  ['the consultancy audit log', '/audit-log', () => <AuditLogPage />],
  ['the platform audit log', '/audit-log/platform', () => <PlatformAuditLogPage />],
] as const)('%s', (_name, path, page) => {
  it('says what search matches, and no longer promises to search reasons', async () => {
    renderPage(page())
    await screen.findByText('Asha Nair')
    expect(screen.getByText(AUDIT_SEARCH_HINT)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search name, record or actor…')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/reason/i)).not.toBeInTheDocument()
  })

  it('shows the label as the current name only, and "[erased]" in the opened row', async () => {
    entries = [
      entry({
        action_type: 'freelancer_paid',
        entity_type: 'freelancer',
        entity_label: 'Deleted User',
        area: 'freelancers',
        reason: '[erased]',
        diff: { amount_inr: [null, 5000] },
      }),
    ]
    renderPage(page())
    const row = (await screen.findByText('Freelancer — Deleted User')).closest('tr')!
    fireEvent.click(row)
    expect(await screen.findByText('This reason was removed when the person’s account was erased.')).toBeInTheDocument()
    expect(screen.getByText('Amount:').closest('p')).toHaveTextContent('Amount: INR 5,000')
  })

  it('sends what is typed as the search', async () => {
    renderPage(page())
    await screen.findByText('Asha Nair')
    fireEvent.change(screen.getByPlaceholderText('Search name, record or actor…'), { target: { value: 'Ravi' } })
    await waitFor(() => expect(auditCalls(path).at(-1)?.search).toBe('Ravi'))
  })
})

describe('the consultancy audit log, actor filter', () => {
  it('searches the roster on the server, people who have left included, and filters by the chosen person', async () => {
    renderPage(<AuditLogPage />)
    await screen.findByText('Asha Nair')
    const actor = screen.getByRole('combobox', { name: 'Actor' })
    fireEvent.focus(actor)
    const leaver = await screen.findByRole('option', { name: /Dev Shah/ })
    expect(within(leaver).getByText('Disabled')).toBeInTheDocument()
    const rosterQuery = (mockedGet.mock.calls as unknown[][]).find((call) => call[0] === '/staff/employees')![1] as {
      params: { query: Record<string, unknown> }
    }
    expect(rosterQuery.params.query['filter[active]']).toBe('all')

    fireEvent.click(leaver)
    await waitFor(() => expect(auditCalls('/audit-log').at(-1)?.filter).toMatchObject({ actor_id: 'e2' }))
  })
})

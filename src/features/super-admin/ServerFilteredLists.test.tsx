import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-154: Payment follow-ups, Student follow-ups, Applicant Allocation and Freelancers used
// to search, filter and sort only the page of rows on screen while their counts covered the whole
// list. Each now sends its search, filters and sort to the server and shows what comes back:
// nothing is narrowed in the browser, and the counts are the server's for the same rows.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('./finance/ConsultancySearchSelect', () => ({
  ConsultancySearchSelect: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange('cons-9')}>
      pick consultancy
    </button>
  ),
}))
vi.mock('./freelancers/FreelancerDrawer', () => ({ FreelancerDrawer: () => null }))
vi.mock('./freelancers/InviteFreelancerModal', () => ({ InviteFreelancerModal: () => null }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { CaseFollowupsPage } from './CaseFollowupsPage'
import { ServiceFollowupsPage } from './ServiceFollowupsPage'
import { ApplicantAllocationPage } from './ApplicantAllocationPage'
import { FreelancersPage } from './FreelancersPage'

const mockedGet = vi.mocked(api.GET)

type Query = {
  cursor?: string
  limit?: number
  search?: string
  sort?: string
  include_snoozed?: boolean
  filter?: Record<string, string>
}

/** Every request sent to `path`, oldest first (the roster walk for the tiles, `limit: 100`, left out). */
function requests(path: string): Query[] {
  return (mockedGet.mock.calls as unknown[][])
    .filter((call) => call[0] === path)
    .map((call) => (call[1] as { params: { query: Query } }).params.query)
    .filter((query) => query.limit !== 100)
}

const lastRequest = (path: string) => requests(path).at(-1)

function renderPage(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

function type(placeholder: string, value: string) {
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } })
}

const summary = (overrides: Record<string, unknown> = {}) => ({
  total: 120,
  not_called: 30,
  due_for_call: 7,
  snoozed: 2,
  by_signal: { payment_overdue: 50, lead_no_reply: 40 },
  pending_inr: 90000,
  ...overrides,
})

const caseRow = (id: string, name: string) => ({
  journey_id: id,
  student_name: name,
  consultancy_name: 'Bright Path',
  signals: [],
  followup_count: 0,
})

const serviceRow = (id: string, name: string) => ({
  student_id: id,
  student_name: name,
  email: `${id}@example.com`,
  signals: [],
  followup_count: 0,
  days_waiting: 4,
  profile_completion_percent: 60,
  intake_label: 'September 2027',
})

beforeEach(() => {
  mockedGet.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('Payment follow-ups', () => {
  beforeEach(() => {
    mockedGet.mockImplementation((async (_path: unknown, opts: { params: { query: Query } }) => {
      const { search, filter } = opts.params.query
      // The server narrows; a search answers with ITS rows and ITS counts.
      if (search === 'meera')
        return { data: { items: [caseRow('j9', 'Meera Pillai')], summary: summary({ total: 1, not_called: 1 }), meta: {} }, error: undefined }
      if (filter?.not_called)
        return { data: { items: [caseRow('j2', 'Ravi Kumar')], summary: summary({ total: 30 }), meta: {} }, error: undefined }
      return {
        data: { items: [caseRow('j1', 'Asha Nair'), caseRow('j2', 'Ravi Kumar')], summary: summary(), meta: { next_cursor: 'p2' } },
        error: undefined,
      }
    }) as never)
  })

  it('sends the search to the server and shows its rows and its counts', async () => {
    renderPage(<CaseFollowupsPage />)
    await screen.findByText('Asha Nair')
    expect(lastRequest('/case-followups')?.filter).toBeUndefined()

    type('Search student or consultancy…', 'meera')

    // Meera is on no loaded page: only the server can have found her.
    expect(await screen.findByText('Meera Pillai')).toBeInTheDocument()
    expect(lastRequest('/case-followups')).toMatchObject({ search: 'meera' })
    expect(screen.queryByText('Asha Nair')).not.toBeInTheDocument()
    // The "Cases" tile is the server's count for the same search.
    expect(screen.getByText('Cases').parentElement).toHaveTextContent('1')
  })

  it('sends signal, consultancy, not-called and due as filters, and starts paging over', async () => {
    renderPage(<CaseFollowupsPage />)
    await screen.findByText('Asha Nair')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(lastRequest('/case-followups')?.cursor).toBe('p2'))

    fireEvent.click(screen.getByRole('button', { name: 'Not called yet', pressed: false }))
    await waitFor(() => expect(lastRequest('/case-followups')?.filter).toEqual({ not_called: 'true' }))
    // A filter belongs to a new list: the cursor of the old one is dropped.
    expect(lastRequest('/case-followups')?.cursor).toBeUndefined()

    fireEvent.change(screen.getByRole('combobox', { name: 'Signal' }), { target: { value: 'payment_overdue' } })
    fireEvent.click(screen.getByRole('button', { name: 'pick consultancy' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Due for a call' }).at(-1)!)
    await waitFor(() =>
      expect(lastRequest('/case-followups')?.filter).toEqual({
        signal: 'payment_overdue',
        consultancy_id: 'cons-9',
        not_called: 'true',
        due_for_call: 'true',
      }),
    )
  })

  it('offers every signal of the queue, with the server count beside it while none is chosen', async () => {
    renderPage(<CaseFollowupsPage />)
    await screen.findByText('Asha Nair')
    expect(screen.getByRole('option', { name: 'Payment overdue (50)' })).toBeInTheDocument()
    // A signal with no count in this answer is still offered.
    expect(screen.getByRole('option', { name: 'Accepted, still open' })).toBeInTheDocument()
  })
})

describe('Student follow-ups', () => {
  it('sends the search and the signal to the server, and shows its rows', async () => {
    mockedGet.mockImplementation((async (_path: unknown, opts: { params: { query: Query } }) =>
      opts.params.query.search === 'zoya'
        ? { data: { items: [serviceRow('s9', 'Zoya Khan')], summary: summary({ total: 1 }), meta: {} }, error: undefined }
        : { data: { items: [serviceRow('s1', 'Asha Nair')], summary: summary(), meta: {} }, error: undefined }) as never)
    renderPage(<ServiceFollowupsPage />)
    await screen.findByText('Asha Nair')

    type('Search student, email or consultancy…', 'zoya')
    expect(await screen.findByText('Zoya Khan')).toBeInTheDocument()
    expect(screen.queryByText('Asha Nair')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Signal' }), { target: { value: 'lead_no_reply' } })
    await waitFor(() =>
      expect(lastRequest('/service-followups')).toMatchObject({ search: 'zoya', filter: { signal: 'lead_no_reply' } }),
    )
  })
})

describe('Applicant Allocation', () => {
  const entry = (id: string, name: string) => ({
    id,
    applicant_name: name,
    source: 'complaint',
    reason: 'consultancy_change',
    created_at: '2026-10-01T09:00:00Z',
  })

  it('sends search, reason and sort to the server, and shows the rows in the order it answers', async () => {
    mockedGet.mockImplementation((async (_path: unknown, opts: { params: { query: Query } }) =>
      opts.params.query.sort === '-applicant_name'
        ? { data: { items: [entry('a2', 'Zoya Khan'), entry('a1', 'Asha Nair')], meta: { total: 2 } }, error: undefined }
        : { data: { items: [entry('a1', 'Asha Nair'), entry('a2', 'Zoya Khan')], meta: { total: 2 } }, error: undefined }) as never)
    renderPage(<ApplicantAllocationPage />)
    await screen.findByText('Asha Nair')
    expect(lastRequest('/applicant-allocation-queue')?.sort).toBeUndefined()

    fireEvent.click(screen.getByText('Applicant'))
    await waitFor(() => expect(lastRequest('/applicant-allocation-queue')?.sort).toBe('applicant_name'))
    fireEvent.click(screen.getByText('Applicant'))
    await waitFor(() => expect(lastRequest('/applicant-allocation-queue')?.sort).toBe('-applicant_name'))
    await waitFor(() => {
      const names = screen.getAllByText(/Asha Nair|Zoya Khan/).map((el) => el.textContent)
      expect(names).toEqual(['Zoya Khan', 'Asha Nair'])
    })

    fireEvent.change(screen.getByRole('combobox', { name: 'Reason' }), { target: { value: 'dispute' } })
    type('Search applicant…', 'zo')
    await waitFor(() =>
      expect(lastRequest('/applicant-allocation-queue')).toMatchObject({
        search: 'zo',
        sort: '-applicant_name',
        filter: { source: 'dispute' },
      }),
    )
  })
})

describe('Freelancers', () => {
  const freelancer = (id: string, name: string, status: string) => ({
    id,
    name,
    email: `${id}@example.com`,
    referral_code: id.toUpperCase(),
    status,
    owed_inr: 100,
    paid_inr: 50,
    earned_inr: 150,
  })

  it('sends search and status to the server; the tiles stay the whole roster', async () => {
    const everyone = [freelancer('f1', 'Asha Nair', 'active'), freelancer('f2', 'Ravi Kumar', 'invited'), freelancer('f3', 'Zoya Khan', 'active')]
    mockedGet.mockImplementation((async (_path: unknown, opts: { params: { query: Query } }) => {
      const { limit, filter } = opts.params.query
      if (limit === 100) return { data: { items: everyone, meta: {} }, error: undefined }
      if (filter?.status === 'invited') return { data: { items: [everyone[1]], meta: { total: 1 } }, error: undefined }
      return { data: { items: everyone.slice(0, 2), meta: { total: 3, next_cursor: 'p2' } }, error: undefined }
    }) as never)
    renderPage(<FreelancersPage />)
    await screen.findByText('Asha Nair')

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'invited' } })
    await waitFor(() => expect(lastRequest('/freelancers')?.filter).toEqual({ status: 'invited' }))
    await waitFor(() => expect(screen.queryByText('Asha Nair')).not.toBeInTheDocument())
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument()
    // The list's count is the server's for the filter…
    expect(screen.getByText('1 result')).toBeInTheDocument()
    // …and the tiles still count every account: two active, whatever the list shows.
    expect(screen.getByText('Active freelancers').parentElement).toHaveTextContent('2')

    type('Search name, email or code…', 'F2')
    await waitFor(() => expect(lastRequest('/freelancers')).toMatchObject({ search: 'F2', filter: { status: 'invited' } }))
  })
})

import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The Clients page's "Waiting for the student to accept" panel (owner decisions 1 and 25, contract
// gate 12f). Pinned here: a row shows only what the consultancy's own staff typed and chose; a
// request can be cancelled after a confirm; ended requests say how they ended in plain words; a
// row whose typed details were erased reads "Expired" with no name; the lists page by cursor.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), DELETE: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { formatDate } from '@/lib/time'
import { useAuthStore } from '@/stores/authStore'
import { alreadyApplied } from '@/test/writeAnswers'
import { useMe } from '@/queries/me'
import { meAnswered, staffMe } from '@/test/me'
import { ApplicantRequestsPanel } from './ApplicantRequestsPanel'
import type { ApplicantRequest } from '@/queries/applicantRequests'

const mockedGet = vi.mocked(api.GET)
const mockedDelete = vi.mocked(api.DELETE)

// The full suite runs these under load; a slow first render must not fail a correct test.
configure({ asyncUtilTimeout: 5000 })

function request(overrides: Partial<ApplicantRequest> = {}): ApplicantRequest {
  return {
    id: 'p1',
    status: 'pending',
    requested: { first_name: 'Asha', last_name: 'Rao', email: 'asha@example.com', phone: '+919800000001' },
    case_type: 'student',
    assigned_employee_id: 'e1',
    assigned_employee_name: 'Meera Iyer',
    created_by_name: 'Dev Shah',
    can_cancel: true,
    sent_at: '2026-10-06T09:00:00Z',
    expires_at: '2026-10-20T09:00:00Z',
    ...overrides,
  }
}

type Page = { items: ApplicantRequest[]; next_cursor?: string | null }

/** What the server holds: `pages[status][cursor ?? '']`. Tests change it to stand for a write. */
let pages: { pending: Record<string, Page>; ended: Record<string, Page> }
let deleteAnswer: { status: number; code?: string; message?: string; details?: Record<string, unknown> }

function listCalls() {
  return (mockedGet.mock.calls as unknown[][])
    .filter((call) => call[0] === '/applicant-requests')
    .map((call) => (call[1] as { params: { query: { filter: { status: string }; cursor?: string; limit?: number } } }).params.query)
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ApplicantRequestsPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

beforeEach(() => {
  pages = { pending: { '': { items: [] } }, ended: { '': { items: [] } } }
  deleteAnswer = { status: 200 }
  mockedGet.mockReset()
  mockedDelete.mockReset()
  vi.mocked(showToast).mockClear()
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(staffMe({ employee_id: 'e7' })))
  mockedGet.mockImplementation((async (_path: string, init: { params: { query: { filter: { status: 'pending' | 'ended' }; cursor?: string } } }) => {
    const { filter, cursor } = init.params.query
    const page = pages[filter.status][cursor ?? ''] ?? { items: [] }
    return { data: { items: page.items, meta: { next_cursor: page.next_cursor ?? null } }, error: undefined }
  }) as never)
  mockedDelete.mockImplementation((async () =>
    deleteAnswer.status === 200
      ? { data: { id: 'p1', status: 'cancelled' }, error: undefined, response: { status: 200 } }
      : {
          data: undefined,
          error: { error: { code: deleteAnswer.code, message: deleteAnswer.message, details: deleteAnswer.details } },
          response: { status: deleteAnswer.status },
        }) as never)
})

describe('ApplicantRequestsPanel — when it shows', () => {
  it('renders nothing when no request is waiting and none ended recently', async () => {
    renderPanel()
    await waitFor(() => expect(listCalls()).toHaveLength(2))
    await waitFor(() => expect(mockedGet.mock.results.every((r) => r.type === 'return')).toBe(true))
    expect(screen.queryByRole('heading', { name: 'Waiting for the student to accept' })).not.toBeInTheDocument()
  })

  it('asks the server for the waiting and the ended requests by filter[status]', async () => {
    pages.pending[''] = { items: [request()] }
    renderPanel()
    await screen.findByRole('heading', { name: 'Waiting for the student to accept' })
    expect(listCalls().map((q) => q.filter.status).sort()).toEqual(['ended', 'pending'])
  })

  it('shows the empty waiting state when only ended requests exist', async () => {
    pages.ended[''] = { items: [request({ id: 'p9', status: 'declined' })] }
    renderPanel()
    expect(await screen.findByText('No requests are waiting for a student to accept.')).toBeInTheDocument()
  })
})

describe('ApplicantRequestsPanel — waiting rows', () => {
  it('shows what the staff member typed, the case type, the consultant, and the sent and expiry dates', async () => {
    pages.pending[''] = { items: [request({ case_type: 'pr' })] }
    renderPanel()

    const row = (await screen.findByText('Asha Rao')).closest('tr')!
    expect(within(row).getByText('asha@example.com')).toBeInTheDocument()
    expect(within(row).getByText('+919800000001')).toBeInTheDocument()
    expect(within(row).getByText('PR')).toBeInTheDocument()
    expect(within(row).getByText('Meera Iyer')).toBeInTheDocument()
    expect(within(row).getByText(formatDate('2026-10-06T09:00:00Z'))).toBeInTheDocument()
    expect(within(row).getByText(formatDate('2026-10-20T09:00:00Z'))).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Cancel request to Asha Rao' })).toBeInTheDocument()
    // The name is plain text: there is no client to open until the student accepts.
    expect(within(row).queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Name',
      'Contact',
      'Applicant type',
      'Assigned to',
      'Sent',
      'Expires',
      '',
    ])
  })

  // Lane x: the server decides who may take a request back, and says so on the row.
  it('offers "Cancel request" exactly on the rows the server marks can_cancel', async () => {
    pages.pending[''] = {
      items: [
        request({ id: 'p1', can_cancel: true }),
        request({
          id: 'p2',
          can_cancel: false,
          requested: { first_name: 'Bina', last_name: 'Das', email: 'bina@example.com' },
        }),
      ],
    }
    renderPanel()

    const mine = (await screen.findByText('Asha Rao')).closest('tr')!
    expect(within(mine).getByRole('button', { name: 'Cancel request to Asha Rao' })).toBeInTheDocument()
    const theirs = screen.getByText('Bina Das').closest('tr')!
    expect(within(theirs).queryByRole('button')).not.toBeInTheDocument()
  })

  it('does not work the rule out itself: an admin whose row says can_cancel false gets no button', async () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(staffMe({ employee_id: 'e1', is_admin: true })))
    pages.pending[''] = { items: [request({ can_cancel: false, created_by_employee_id: 'e1' })] }
    renderPanel()
    const row = (await screen.findByText('Asha Rao')).closest('tr')!
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()
  })

  it('says "By you" from the employee id of the sender, and the name of the colleague otherwise', async () => {
    pages.pending[''] = {
      items: [
        request({ id: 'p1', created_by_employee_id: 'e7', created_by_name: 'Asha Nair' }),
        request({
          id: 'p2',
          created_by_employee_id: 'e9',
          created_by_name: 'Dev Shah',
          requested: { first_name: 'Bina', last_name: 'Das', email: 'bina@example.com' },
        }),
        // A namesake of the viewer with no sender id is never "you".
        request({
          id: 'p3',
          created_by_employee_id: null,
          created_by_name: 'Asha Nair',
          requested: { first_name: 'Chitra', last_name: 'Pai', email: 'chitra@example.com' },
        }),
      ],
    }
    renderPanel()
    expect(within((await screen.findByText('Asha Rao')).closest('tr')!).getByText('By you')).toBeInTheDocument()
    expect(within(screen.getByText('Bina Das').closest('tr')!).getByText('By Dev Shah')).toBeInTheDocument()
    const namesake = screen.getByText('Chitra Pai').closest('tr')!
    expect(within(namesake).getByText('By Asha Nair')).toBeInTheDocument()
    expect(within(namesake).queryByText('By you')).not.toBeInTheDocument()
  })

  it('cancels after a confirm and the row leaves the list without a reload', async () => {
    pages.pending[''] = { items: [request()] }
    pages.ended[''] = { items: [request({ id: 'p0', status: 'declined' })] }
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel request to Asha Rao' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel request' })
    expect(dialog).toHaveTextContent(
      'Cancel this request? Asha Rao will no longer be able to accept it. You can ask again after 24 hours.',
    )
    expect(mockedDelete).not.toHaveBeenCalled()

    pages.pending[''] = { items: [] }
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel request' }))

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Request cancelled'))
    const [path, init] = mockedDelete.mock.calls[0] as unknown as [string, { params: { path: { id: string }; header: Record<string, string> } }]
    expect(path).toBe('/conversion-proposals/{id}')
    expect(init.params.path.id).toBe('p1')
    expect(init.params.header['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    await waitFor(() => expect(screen.queryByText('Asha Rao')).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: 'Cancel request' })).not.toBeInTheDocument()
  })

  it('keeps the request when the confirm is dismissed', async () => {
    pages.pending[''] = { items: [request()] }
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel request to Asha Rao' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep request' }))
    expect(screen.queryByRole('dialog', { name: 'Cancel request' })).not.toBeInTheDocument()
    expect(mockedDelete).not.toHaveBeenCalled()
  })

  it('a 404 says the request is not theirs to cancel', async () => {
    pages.pending[''] = { items: [request()] }
    deleteAnswer = { status: 404, code: 'not_found', message: 'Not found.' }
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel request to Asha Rao' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Cancel request' })).getByRole('button', { name: 'Cancel request' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("You can't cancel this request.")
    expect(showToast).not.toHaveBeenCalled()
  })

  it('a request that is no longer pending shows the server message', async () => {
    pages.pending[''] = { items: [request()] }
    deleteAnswer = { status: 400, code: 'validation_failed', message: 'This request has already been answered.' }
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel request to Asha Rao' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Cancel request' })).getByRole('button', { name: 'Cancel request' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This request has already been answered.')
  })

  it('an already-applied answer counts as cancelled', async () => {
    pages.pending[''] = { items: [request()] }
    deleteAnswer = alreadyApplied() as typeof deleteAnswer
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel request to Asha Rao' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Cancel request' })).getByRole('button', { name: 'Cancel request' }))

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Request cancelled'))
    expect(mockedDelete).toHaveBeenCalledTimes(1)
  })

  it('refetches when the live signal marks the requests stale', async () => {
    pages.pending[''] = { items: [request()] }
    const client = renderPanel()
    await screen.findByText('Asha Rao')

    pages.pending[''] = { items: [] }
    pages.ended[''] = { items: [request({ status: 'approved', client_id: 'c1' })] }
    await client.invalidateQueries({ queryKey: ['applicant-requests'] })

    expect(await screen.findByText('No requests are waiting for a student to accept.')).toBeInTheDocument()
  })
})

describe('ApplicantRequestsPanel — recently ended', () => {
  it('says how each request ended, and links an accepted one to its client', async () => {
    pages.ended[''] = {
      items: [
        request({ id: 'a', status: 'approved', client_id: 'c1', requested: { first_name: 'Asha', last_name: 'Rao', email: 'a@example.com' } }),
        request({ id: 'b', status: 'declined', requested: { first_name: 'Bina', last_name: 'Das', email: 'b@example.com' } }),
        request({ id: 'c', status: 'expired', requested: { first_name: 'Chitra', last_name: 'Nair', email: 'c@example.com' } }),
        request({ id: 'd', status: 'cancelled', requested: { first_name: 'Deepa', last_name: 'Pillai', email: 'd@example.com' } }),
      ],
    }
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Recently ended' }))
    expect(await screen.findByRole('heading', { name: 'Recently ended requests' })).toBeInTheDocument()

    const rowOf = (name: string) => screen.getByText(name).closest('tr')!
    expect(within(rowOf('Asha Rao')).getByText('Accepted')).toBeInTheDocument()
    expect(within(rowOf('Asha Rao')).getByRole('link', { name: 'View client' })).toHaveAttribute('href', '/clients/c1')
    expect(within(rowOf('Bina Das')).getByText('Declined')).toBeInTheDocument()
    expect(within(rowOf('Chitra Nair')).getByText('Expired')).toBeInTheDocument()
    expect(within(rowOf('Deepa Pillai')).getByText('Cancelled')).toBeInTheDocument()
    expect(within(rowOf('Bina Das')).queryByRole('link')).not.toBeInTheDocument()
    // Nothing to cancel once a request has ended.
    expect(screen.queryByRole('button', { name: /^Cancel request/ })).not.toBeInTheDocument()
  })

  it('a row whose typed details were erased reads "Expired" with no name and no link', async () => {
    pages.ended[''] = { items: [request({ id: 'x', status: 'approved', client_id: 'c7', requested: null })] }
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Recently ended' }))

    const row = (await screen.findByText('Expired')).closest('tr')!
    expect(within(row).queryByText('Accepted')).not.toBeInTheDocument()
    expect(within(row).queryByRole('link')).not.toBeInTheDocument()
    expect(within(row).getAllByRole('cell')[0]).toHaveTextContent('—')
  })

  it('shows the empty state when nothing ended recently', async () => {
    pages.pending[''] = { items: [request()] }
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Recently ended' }))
    expect(await screen.findByText('No requests have ended recently.')).toBeInTheDocument()
  })
})

describe('ApplicantRequestsPanel — paging', () => {
  it('follows the server cursor forward and back', async () => {
    pages.pending[''] = { items: [request()], next_cursor: 'cur-2' }
    pages.pending['cur-2'] = {
      items: [request({ id: 'p2', requested: { first_name: 'Bina', last_name: 'Das', email: 'b@example.com' } })],
    }
    renderPanel()
    await screen.findByText('Asha Rao')

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Bina Das')).toBeInTheDocument()
    expect(screen.queryByText('Asha Rao')).not.toBeInTheDocument()
    expect(listCalls()).toContainEqual({ filter: { status: 'pending' }, cursor: 'cur-2', limit: 5 })
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument()
  })
})

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner decision 58 (2026-10-08): suspending a consultancy can also sign out and block all of its
// staff. Pinned: the tick is off by default and says what it does; `block_staff` is sent only
// when ticked; the admin record says "Staff blocked"; and Reactivate's confirm says staff can
// sign in again when they were blocked.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, platformMe } from '@/test/me'
import type { components } from '@/api/schema'
import { ConsultancyDetail } from './ManageConsultanciesPage'

type Consultancy = components['schemas']['Consultancy']

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

const ACTIVE = {
  id: 'c1',
  name: 'Northwind Education',
  kind: 'consultancy',
  country: 'India',
  city: 'Pune',
  active: true,
  staff_blocked: false,
  kyc_verified: true,
  tier: 'business',
  seat_limit: 10,
  seats_used: 4,
} as unknown as Consultancy
const SUSPENDED = { ...ACTIVE, active: false } as Consultancy
const SUSPENDED_AND_BLOCKED = { ...ACTIVE, active: false, staff_blocked: true } as Consultancy

function renderDetail(consultancy: Consultancy) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ConsultancyDetail consultancy={consultancy} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function suspendCalls() {
  return (mockedPost.mock.calls as unknown[][]).filter((call) => call[0] === '/consultancies/{id}/suspend')
}

/** The Suspend confirm, opened and with SUSPEND typed. */
function openSuspendConfirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Suspend' }))
  const confirm = screen.getByRole('dialog', { name: 'Suspend Consultancy' })
  fireEvent.change(within(confirm).getByLabelText('Confirmation'), { target: { value: 'SUSPEND' } })
  return confirm
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  vi.mocked(showToast).mockClear()
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ consultancy_approval: true })))
  mockedGet.mockResolvedValue({ data: { items: [], meta: { next_cursor: null } }, error: undefined } as never)
  mockedPost.mockResolvedValue({ data: SUSPENDED, error: undefined } as never)
})

describe('suspending a consultancy', () => {
  it('offers to also block its staff, unticked, and says what that does', () => {
    renderDetail(ACTIVE)
    const confirm = openSuspendConfirm()
    expect(within(confirm).getByRole('checkbox', { name: 'Also sign out and block all staff of this consultancy' })).not.toBeChecked()
    expect(
      within(confirm).getByText(
        'Staff cannot sign in until the consultancy is reactivated. Use this when the consultancy’s accounts may be misused.',
      ),
    ).toBeInTheDocument()
  })

  it('sends a plain suspension, with no body, when the box is left unticked', async () => {
    renderDetail(ACTIVE)
    const confirm = openSuspendConfirm()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Suspend' }))

    await waitFor(() => expect(suspendCalls()).toHaveLength(1))
    expect(suspendCalls()[0][1]).toEqual({ params: { path: { id: 'c1' } } })
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Northwind Education suspended'))
  })

  it('sends block_staff: true when it is ticked', async () => {
    renderDetail(ACTIVE)
    const confirm = openSuspendConfirm()
    fireEvent.click(within(confirm).getByRole('checkbox', { name: /Also sign out and block all staff/ }))
    fireEvent.click(within(confirm).getByRole('button', { name: 'Suspend' }))

    await waitFor(() => expect(suspendCalls()).toHaveLength(1))
    expect(suspendCalls()[0][1]).toEqual({ params: { path: { id: 'c1' } }, body: { block_staff: true } })
  })

  it('still needs SUSPEND typed, whatever the box says', () => {
    renderDetail(ACTIVE)
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }))
    const confirm = screen.getByRole('dialog', { name: 'Suspend Consultancy' })
    fireEvent.click(within(confirm).getByRole('checkbox', { name: /Also sign out and block all staff/ }))
    expect(within(confirm).getByRole('button', { name: 'Suspend' })).toBeDisabled()
  })
})

describe('a suspended consultancy’s record', () => {
  it('says "Staff blocked" when its staff were blocked, and Reactivate says they can sign in again', async () => {
    renderDetail(SUSPENDED_AND_BLOCKED)
    expect(screen.getByText('Suspended')).toBeInTheDocument()
    expect(screen.getByText('Staff blocked')).toBeInTheDocument()
    expect(screen.getByText('It is off the student app, and its staff cannot sign in until it is reactivated.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }))
    const confirm = screen.getByRole('dialog', { name: 'Reactivate Consultancy' })
    expect(confirm).toHaveTextContent(
      'Reactivate Northwind Education? It returns to the student app, and its staff, who are blocked now, can sign in again.',
    )

    fireEvent.click(within(confirm).getByRole('button', { name: 'Reactivate' }))
    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/consultancies/{id}/reactivate', { params: { path: { id: 'c1' } } }),
    )
  })

  it('says nothing about blocked staff when they were not blocked', () => {
    renderDetail(SUSPENDED)
    expect(screen.getByText('Suspended')).toBeInTheDocument()
    expect(screen.queryByText('Staff blocked')).not.toBeInTheDocument()
    expect(screen.getByText('It is off the student app. Its staff still sign in and see their existing work.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }))
    const confirm = screen.getByRole('dialog', { name: 'Reactivate Consultancy' })
    expect(confirm).toHaveTextContent('Reactivate Northwind Education? Every staff member gets access back at once.')
    expect(confirm).not.toHaveTextContent('sign in again')
  })

  it('an active consultancy is not marked', () => {
    renderDetail(ACTIVE)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.queryByText('Staff blocked')).not.toBeInTheDocument()
  })
})

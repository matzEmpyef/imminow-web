import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Lane w: `PATCH /complaints/{id}` `{assign_to_me: true}` answers 409 `taken_over` when a colleague
// picked the complaint up in the last few seconds. Pinned here: the server's sentence is shown,
// the row is read again so the drawer names who REALLY has it (`details.assigned_to_id`), the
// confirm stops offering to take over from the previous owner, and the user can take over again.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), PATCH: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import type { Complaint } from '@/queries/complaints'
import { ComplaintsPage } from './ComplaintsPage'

const mockedGet = vi.mocked(api.GET)
const mockedPatch = vi.mocked(api.PATCH)

function complaint(overrides: Partial<Complaint> = {}): Complaint {
  return {
    id: 'cmp-1',
    student_name: 'Ravi Menon',
    email: 'ravi@example.test',
    category: 'other',
    description: 'My consultant has not replied for two weeks.',
    status: 'in_review',
    created_at: '2026-10-01T09:00:00Z',
    assigned_to_id: 'u-dev',
    assigned_to_name: 'Dev Shah',
    picked_up_at: '2026-10-02T09:00:00Z',
    ...overrides,
  } as Complaint
}

const TAKEN_BY_MEERA = {
  data: undefined,
  error: {
    error: {
      code: 'taken_over',
      message: 'Meera Iyer has just taken this complaint — refresh and try again.',
      details: { assigned_to_id: 'u-meera' },
    },
  },
  response: { status: 409 },
} as never

/** The row the server holds; tests change it to stand for a colleague getting there first. */
let served: Complaint
/** Set to hold the list's next answer back, so the moment before the refresh can be looked at. */
let releaseList: (() => void) | null

function listCalls() {
  return (mockedGet.mock.calls as unknown[][]).filter((call) => call[0] === '/complaints').length
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ComplaintsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openDrawer() {
  renderPage()
  fireEvent.click(await screen.findByText('Ravi Menon'))
  return screen.findByRole('dialog')
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPatch.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  served = complaint()
  releaseList = null
  let held = false
  mockedGet.mockImplementation((async (path: string) => {
    if (path === '/complaints') {
      const row = served
      if (held) await new Promise<void>((resolve) => (releaseList = resolve))
      return { data: { items: [row], meta: { next_cursor: null, total: 1 }, summary: { open: 0, in_review: 1, resolved: 0 } }, error: undefined }
    }
    return { data: { items: [], meta: { next_cursor: null } }, error: undefined }
  }) as never)
  // Exposed to a test through `holdNextList()`.
  holdNextList = () => {
    held = true
  }
})

let holdNextList: () => void

describe('taking over a complaint a colleague has just taken (409 taken_over)', () => {
  it('shows the server sentence, reads the row again, and lets the user take over from the real owner', async () => {
    const drawer = await openDrawer()
    expect(within(drawer).getByText('Dev Shah')).toBeInTheDocument()

    fireEvent.click(within(drawer).getByRole('button', { name: 'Take over' }))
    const confirm = screen.getByRole('dialog', { name: 'Take over' })
    expect(confirm).toHaveTextContent('Take over from Dev Shah? They’ll be told.')

    // Meera got there first.
    const before = listCalls()
    served = complaint({ assigned_to_id: 'u-meera', assigned_to_name: 'Meera Iyer', picked_up_at: '2026-10-07T09:00:00Z' })
    mockedPatch.mockResolvedValueOnce(TAKEN_BY_MEERA)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Take over' }))

    expect(await within(confirm).findByText('Meera Iyer has just taken this complaint — refresh and try again.')).toBeInTheDocument()
    expect(mockedPatch.mock.calls[0][1]).toEqual({ params: { path: { id: 'cmp-1' } }, body: { assign_to_me: true } })

    // The list was read again and the drawer names who has it now.
    await waitFor(() => expect(listCalls()).toBeGreaterThan(before))
    await waitFor(() => expect(confirm).toHaveTextContent('Take over from Meera Iyer? They’ll be told.'))
    expect(within(drawer).getAllByText('Meera Iyer').length).toBeGreaterThan(0)
    expect(within(drawer).queryByText('Dev Shah')).not.toBeInTheDocument()

    // Taking over again, from her, works.
    const mine = complaint({ assigned_to_id: 'u-me', assigned_to_name: 'Asha Nair', picked_up_at: '2026-10-07T09:01:00Z' })
    served = mine
    mockedPatch.mockResolvedValueOnce({ data: mine, error: undefined } as never)
    const retry = within(confirm).getByRole('button', { name: 'Take over' })
    await waitFor(() => expect(retry).toBeEnabled())
    fireEvent.click(retry)

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Take over' })).not.toBeInTheDocument())
    expect(mockedPatch).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(within(drawer).getAllByText('Asha Nair').length).toBeGreaterThan(0))
  })

  it('until the fresh row arrives, the confirm does not name the previous owner and cannot be pressed', async () => {
    const drawer = await openDrawer()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Take over' }))
    const confirm = screen.getByRole('dialog', { name: 'Take over' })

    served = complaint({ assigned_to_id: 'u-meera', assigned_to_name: 'Meera Iyer' })
    holdNextList()
    mockedPatch.mockResolvedValueOnce(TAKEN_BY_MEERA)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Take over' }))

    await within(confirm).findByText('Meera Iyer has just taken this complaint — refresh and try again.')
    await waitFor(() => expect(releaseList).not.toBeNull())
    expect(confirm).toHaveTextContent('Take over from the colleague who has it now? They’ll be told.')
    expect(confirm).not.toHaveTextContent('Dev Shah')
    // The button waits ("Please wait…") while the row is read again.
    expect(within(confirm).queryByRole('button', { name: 'Take over' })).not.toBeInTheDocument()
    expect(within(confirm).getByRole('button', { name: 'Please wait…' })).toBeDisabled()

    releaseList!()
    await waitFor(() => expect(confirm).toHaveTextContent('Take over from Meera Iyer? They’ll be told.'))
    expect(within(confirm).getByRole('button', { name: 'Take over' })).toBeEnabled()
  })

  it('a pick-up that lost the race shows the sentence, and the owner section offers "Take over" from who has it', async () => {
    served = complaint({ status: 'open', assigned_to_id: null, assigned_to_name: null, picked_up_at: null })
    const drawer = await openDrawer()
    expect(within(drawer).getByText('Unassigned')).toBeInTheDocument()

    served = complaint({ assigned_to_id: 'u-meera', assigned_to_name: 'Meera Iyer' })
    mockedPatch.mockResolvedValueOnce(TAKEN_BY_MEERA)
    fireEvent.click(within(drawer).getByRole('button', { name: 'Pick up' }))

    expect(await within(drawer).findByRole('alert')).toHaveTextContent(
      'Meera Iyer has just taken this complaint — refresh and try again.',
    )
    expect(mockedPatch.mock.calls[0][1]).toEqual({
      params: { path: { id: 'cmp-1' } },
      body: { assign_to_me: true, status: 'in_review' },
    })
    await waitFor(() => expect(within(drawer).queryByText('Unassigned')).not.toBeInTheDocument())
    expect(within(drawer).getAllByText('Meera Iyer').length).toBeGreaterThan(0)
    expect(within(drawer).getByRole('button', { name: 'Take over' })).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Pick up' })).not.toBeInTheDocument()
  })

  it('a take-over that succeeds first time closes the confirm and shows the new owner', async () => {
    const drawer = await openDrawer()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Take over' }))
    const mine = complaint({ assigned_to_id: 'u-me', assigned_to_name: 'Asha Nair' })
    served = mine
    mockedPatch.mockResolvedValueOnce({ data: mine, error: undefined } as never)
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Take over' })).getByRole('button', { name: 'Take over' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Take over' })).not.toBeInTheDocument())
    await waitFor(() => expect(within(drawer).getAllByText('Asha Nair').length).toBeGreaterThan(0))
    expect(within(drawer).queryByRole('alert')).not.toBeInTheDocument()
  })
})

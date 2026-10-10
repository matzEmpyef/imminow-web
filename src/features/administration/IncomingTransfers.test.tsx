import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The Incoming Transfers list (second erasure review). A code whose student's contact was removed
// afterwards has both contacts null and reads `expired`: the row says "Contact removed" rather than
// showing an error or a blank.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { IncomingTransfersTab } from './ConsultancyIncomingTransfersTab'

const mockedGet = vi.mocked(api.GET)

function code(overrides: Record<string, unknown>) {
  return {
    code: 'TC-0001',
    student_email: null,
    student_phone: null,
    status: 'active',
    expires_at: '2026-10-10T09:00:00Z',
    created_at: '2026-10-07T09:00:00Z',
    ...overrides,
  }
}

function renderTab(isInstitute = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <IncomingTransfersTab isInstitute={isInstitute} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockedGet.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('the Incoming Transfers list', () => {
  it('shows "Contact removed" for a code with no contact left, with its status, and no error', async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        items: [
          code({ code: 'TC-0001', student_email: 'meera@example.test' }),
          code({ code: 'TC-0002', student_phone: '+919876543210' }),
          code({ code: 'TC-0003', status: 'expired' }),
        ],
        meta: { next_cursor: null, total: 3 },
      },
      error: undefined,
    } as never)
    renderTab()
    const removed = (await screen.findByText('TC-0003')).closest('tr')!
    expect(within(removed).getByText('Contact removed')).toBeInTheDocument()
    expect(within(removed).getByText('Expired')).toBeInTheDocument()
    expect(screen.queryByText('Could not load transfer codes.')).not.toBeInTheDocument()
    expect(screen.getAllByText('Contact removed')).toHaveLength(1)
    // The rows that still have a contact show it, as before.
    expect(within(screen.getByText('TC-0001').closest('tr')!).getByText('meera@example.test')).toBeInTheDocument()
    expect(within(screen.getByText('TC-0002').closest('tr')!).getByText('+919876543210')).toBeInTheDocument()
  })
})

// Owner's ruling 2026-10-10: receiving a transferred student is open to every plan (the permission
// is the only gate, applied by the page), so the tab carries no plan check of its own. Only a
// university account is refused.
describe('issuing a transfer code', () => {
  const EMPTY = { data: { items: [], meta: { next_cursor: null, total: 0 } }, error: undefined } as never

  it('is offered with no plan entitlement to check', async () => {
    mockedGet.mockResolvedValue(EMPTY)
    renderTab()
    expect(await screen.findByRole('button', { name: /Issue a code/ })).toBeInTheDocument()
  })

  it('hides the Issue action for a university account and says why', async () => {
    mockedGet.mockResolvedValue(EMPTY)
    renderTab(true)
    expect(await screen.findByText(/A university account cannot receive transferred students/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Issue a code/ })).not.toBeInTheDocument()
  })

  it('shows the server’s sentence when the code is refused', async () => {
    mockedGet.mockResolvedValue(EMPTY)
    vi.mocked(api.POST).mockResolvedValue({
      data: undefined,
      error: {
        error: {
          code: 'feature_locked',
          message: 'A university account cannot receive transferred students.',
          status: 403,
        },
      },
      response: { status: 403 },
    } as never)
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: /Issue a code/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/registered email/), { target: { value: 'meera@example.test' } })
    fireEvent.change(within(dialog).getByLabelText(/^Reason/), { target: { value: 'Moving cities' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue code' }))
    await waitFor(() =>
      expect(within(dialog).getByText('A university account cannot receive transferred students.')).toBeInTheDocument(),
    )
  })
})

import { render, screen, within } from '@testing-library/react'
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

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <IncomingTransfersTab />
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

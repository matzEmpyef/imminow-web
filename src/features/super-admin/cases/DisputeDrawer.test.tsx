import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner decision 56 (2026-10-08): when Support deletes a student's account with a dispute open,
// the deletion closes the dispute itself. It arrives here already resolved (`close`, "The account
// was deleted by Support."), and the drawer must read as a closed record with nothing left to do.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))

import { api } from '@/api/client'
import { formatDate } from '@/lib/time'
import type { CaseDispute } from '@/queries/disputes'
import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, platformMe } from '@/test/me'
import { DisputeDrawer } from './DisputeDrawer'

const OPEN = {
  id: 'd1',
  journey_id: 'j1',
  consultancy_id: 'c1',
  consultancy_name: 'Bright Path',
  student_name: 'Meera Pillai',
  status: 'open',
  raised_by: 'student',
  reason: 'No reply for a month.',
  case_progress: null,
  assigned_to_name: 'Dev Shah',
  picked_up_at: '2026-10-02T09:00:00Z',
  resolution_action: null,
  resolution_note: null,
  resolved_at: null,
  resolved_by_name: null,
  reassign_pending: false,
} as unknown as CaseDispute

const CLOSED_BY_DELETION = {
  ...OPEN,
  status: 'resolved',
  resolution_action: 'close',
  resolution_note: 'The account was deleted by Support.',
  resolved_at: '2026-10-08T11:00:00Z',
  resolved_by_name: 'Ananya Rao',
} as unknown as CaseDispute

function renderDrawer(dispute: CaseDispute) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DisputeDrawer dispute={dispute} onClose={() => {}} onUpdated={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(api.GET).mockReset()
  vi.mocked(api.GET).mockResolvedValue({ data: { items: [], meta: { next_cursor: null } }, error: undefined } as never)
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ support: true })))
})

describe('a dispute closed by Support deleting the account', () => {
  it('reads as resolved, with the reason, who and when', () => {
    renderDrawer(CLOSED_BY_DELETION)
    expect(screen.getByText('Resolved')).toBeInTheDocument()
    expect(screen.queryByText('Open')).not.toBeInTheDocument()
    expect(screen.getByText('Closed the case')).toBeInTheDocument()
    expect(screen.getByText('The account was deleted by Support.')).toBeInTheDocument()
    expect(screen.getByText(`Ananya Rao · ${formatDate('2026-10-08T11:00:00Z')}`)).toBeInTheDocument()
  })

  it('offers no action: no Resolve, no note to add, no pick up or take over', () => {
    renderDrawer(CLOSED_BY_DELETION)
    for (const name of ['Resolve', 'Close dispute', 'Add note', 'Pick up', 'Take over']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('an open dispute still offers Resolve', () => {
    renderDrawer(OPEN)
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Take over' })).toBeInTheDocument()
  })
})

import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

// Phase 8 T2-10: a visit request whose day has gone by reads "Date passed" in the list, not Pending.
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/queries/visitRequests', () => ({ useVisitRequests: vi.fn(), useNudgeVisitRequest: vi.fn() }))

import { useVisitRequests } from '@/queries/visitRequests'
import { VisitRequestsPage } from './VisitRequestsPage'

function request(id: string, name: string, extra: Record<string, unknown>) {
  return {
    id,
    context: { name, kind: 'college' },
    consultancy_name: 'Bright Path',
    proposed_date: '2026-10-20',
    proposed_time: '11:00',
    waiting_hours: 5,
    responded: false,
    nudge_count: 0,
    ...extra,
  }
}

describe('Visit Requests list: Date passed', () => {
  it('shows Date passed instead of Pending for a request whose day has gone by', () => {
    vi.mocked(useVisitRequests).mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        items: [request('v1', 'Asha Menon', { date_passed: true }), request('v2', 'Ravi Das', { date_passed: false })],
        meta: { next_cursor: null, total: 2 },
        summary: { pending: 1, responded: 0, pending_over_24h: 0 },
      },
    } as never)
    render(
      <MemoryRouter>
        <VisitRequestsPage />
      </MemoryRouter>,
    )
    const passed = screen.getByText('Asha Menon').closest('tr')!
    expect(within(passed).getByText('Date passed')).toBeInTheDocument()
    expect(within(passed).queryByText('Pending')).not.toBeInTheDocument()
    expect(within(screen.getByText('Ravi Das').closest('tr')!).getByText('Pending')).toBeInTheDocument()
  })
})

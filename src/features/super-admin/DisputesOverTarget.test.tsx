import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

// Phase 8 C-27: an open dispute seven days old or more is marked "Over 7 days" in the queue.
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/queries/disputes', () => ({ useDisputes: vi.fn() }))

import { useDisputes } from '@/queries/disputes'
import { DisputesPage } from './DisputesPage'

function dispute(id: string, name: string, extra: Record<string, unknown>) {
  return {
    id,
    student_name: name,
    consultancy_name: 'Northwind',
    raised_by: 'consultancy',
    raised_by_name: 'Priya',
    paused_days: 2,
    status: 'open',
    case_progress: null,
    assigned_to_name: null,
    ...extra,
  }
}

describe('Disputes queue: the service target', () => {
  it('marks an open dispute that is over target, and no other', () => {
    vi.mocked(useDisputes).mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        items: [
          dispute('d1', 'Asha Nair', { paused_days: 9, over_target: true }),
          dispute('d2', 'Ravi Menon', { over_target: false }),
          dispute('d3', 'Meera Das', { status: 'resolved', over_target: true }),
        ],
        meta: { next_cursor: null, total: 3 },
        summary: { open: 2, open_over_3_days: 1, resolved_this_month: 1 },
      },
    } as never)
    render(
      <MemoryRouter>
        <DisputesPage />
      </MemoryRouter>,
    )
    expect(within(screen.getByText('Asha Nair').closest('tr')!).getByText('Over 7 days')).toBeInTheDocument()
    expect(within(screen.getByText('Ravi Menon').closest('tr')!).queryByText('Over 7 days')).not.toBeInTheDocument()
    expect(within(screen.getByText('Meera Das').closest('tr')!).queryByText('Over 7 days')).not.toBeInTheDocument()
    expect(screen.getAllByText('Over 7 days')).toHaveLength(1)
  })
})

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 8 scan: the "Waiting" figure is the server's `days_waiting` (India's calendar, its clock).
// The page never counts days from the browser's clock — a row from 28-10-2026 once read "Today".
vi.mock('@/features/auth/AdminShell', () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/queries/applicantAllocation', () => ({
  useApplicantAllocationQueue: vi.fn(),
  useAllocateApplicant: vi.fn(),
  useAllocationCandidates: vi.fn(),
  useResolveAllocationRequest: vi.fn(),
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/components/SearchSelect', () => ({ SearchSelect: () => null }))

import {
  useAllocateApplicant,
  useAllocationCandidates,
  useApplicantAllocationQueue,
  useResolveAllocationRequest,
} from '@/queries/applicantAllocation'
import { ApplicantAllocationPage } from './ApplicantAllocationPage'
import { waitingText } from './waitingText'

const row = (name: string, days_waiting: number) => ({
  id: `q-${name}`,
  applicant_name: name,
  source: 'freelancer_signup',
  reason: 'freelancer_sourced',
  created_at: '2026-10-28T09:00:00Z',
  guardian_status: 'not_required',
  awaiting_guardian_approval: false,
  days_waiting,
})

beforeEach(() => {
  vi.mocked(useAllocateApplicant).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false, error: null } as never)
  vi.mocked(useAllocationCandidates).mockReturnValue({ data: [], isLoading: false, isError: false } as never)
  vi.mocked(useResolveAllocationRequest).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
})
afterEach(() => vi.useRealTimers())

describe('Applicant Allocation — Waiting', () => {
  it('words the served days: Today, 1 day, N days', () => {
    expect(waitingText(0)).toBe('Today')
    expect(waitingText(1)).toBe('1 day')
    expect(waitingText(5)).toBe('5 days')
  })

  it('shows the served days_waiting, whatever the browser’s clock says', () => {
    // The browser's clock is years after created_at; the page still reads what the server served.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    vi.mocked(useApplicantAllocationQueue).mockReturnValue({
      data: { items: [row('Asha', 0), row('Ravi', 1), row('Meera', 4)] },
      isLoading: false,
      isError: false,
    } as never)
    render(
      <MemoryRouter>
        <ApplicantAllocationPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('1 day')).toBeInTheDocument()
    expect(screen.getByText('4 days')).toBeInTheDocument()
    // More than three days waiting is flagged Overdue; one and zero are not.
    expect(screen.getAllByText('Overdue')).toHaveLength(1)
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The money-correctness round (2026-10-08), on Finance's Cases tab: the "Void requests" quick
// filter with the server's count, and written-off money as its own figure on a case row.
vi.mock('@/queries/financeDashboard', () => ({ useFinanceCases: vi.fn(), useFinanceVoidRequestCount: vi.fn() }))
vi.mock('@/queries/countries', () => ({ useCountries: () => ({ data: [] }) }))
vi.mock('./ConsultancySearchSelect', () => ({ ConsultancySearchSelect: () => null }))
vi.mock('./FinanceCaseDrawer', () => ({ FinanceCaseDrawer: () => null }))

import { useFinanceCases, useFinanceVoidRequestCount } from '@/queries/financeDashboard'
import { CasesTab } from './CasesTab'

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'e1',
  applicant_name: 'Aiko Tanaka',
  consultancy_name: 'Alpha Consult',
  destination_country: 'Canada',
  college_name: 'Test College',
  rate_percent: 10,
  rate_source: 'configured',
  due_inr: 60000,
  expected_share_inr: 0,
  paid_inr: 57600,
  written_off_inr: 0,
  settled: false,
  outstanding_inr: 2400,
  overdue_inr: 0,
  next_due_on: null,
  payment_status: 'part_paid',
  accepted_at: '2026-09-01',
  case_closed: true,
  recognized_at: '2026-09-20',
  by_currency: [],
  ...overrides,
})

function setup(rows: Record<string, unknown>[], voidRequests = 0) {
  vi.mocked(useFinanceCases).mockReturnValue({
    data: { items: rows, meta: { total: rows.length }, totals: null },
    isLoading: false,
    isError: false,
    error: null,
  } as never)
  vi.mocked(useFinanceVoidRequestCount).mockReturnValue({ data: voidRequests } as never)
  render(
    <MemoryRouter>
      <CasesTab />
    </MemoryRouter>,
  )
}

const lastFilters = () => vi.mocked(useFinanceCases).mock.calls.at(-1)![0]

beforeEach(() => {
  vi.mocked(useFinanceCases).mockReset()
  vi.mocked(useFinanceVoidRequestCount).mockReset()
})

describe('CasesTab, void requests', () => {
  it('shows the server’s count on the chip and filters the list when pressed', () => {
    setup([row()], 3)
    const chip = screen.getByRole('button', { name: 'Void requests (3)' })
    expect(lastFilters()).toMatchObject({ void_requested: undefined })

    fireEvent.click(chip)
    expect(lastFilters()).toMatchObject({ void_requested: true })
    expect(screen.getByRole('button', { name: 'Void requests (3)' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the chip without a number when nothing is waiting', () => {
    setup([row()], 0)
    expect(screen.getByRole('button', { name: 'Void requests' })).toBeInTheDocument()
  })
})

describe('CasesTab, a case settled by a write-off', () => {
  it('shows written-off as its own figure beside Paid, and the Settled mark', () => {
    setup([row({ paid_inr: 57600, written_off_inr: 2400, settled: true, outstanding_inr: 0, payment_status: 'paid' })])
    expect(screen.getByText('₹57,600')).toBeInTheDocument()
    expect(screen.getByText('Written off ₹2,400')).toBeInTheDocument()
    expect(screen.getByText('Settled')).toBeInTheDocument()
  })

  it('shows neither on a case with no write-off', () => {
    setup([row()])
    expect(screen.queryByText(/Written off/)).toBeNull()
    expect(screen.queryByText('Settled')).toBeNull()
  })
})

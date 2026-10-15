import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 8 scan: each row of "Balances by consultancy and institute" adds up on the page —
// Due = Paid − Credit + Waived + Outstanding + Exchange difference — with Written off beside Due.
// A column that is zero on every row is left out.
vi.mock('@/queries/financeDashboard', () => ({ useFinanceSummary: vi.fn(), useFinanceBalances: vi.fn() }))
vi.mock('./FinanceRevenueChart', () => ({ FinanceRevenueChart: () => null }))
vi.mock('./FinanceSummaryTiles', () => ({ FinanceSummaryTiles: () => null }))
vi.mock('./ConsultancyBalanceDrawer', () => ({ ConsultancyBalanceDrawer: () => null }))

import { useFinanceBalances, useFinanceSummary } from '@/queries/financeDashboard'
import { OverviewTab } from './OverviewTab'

const base = {
  cases: 2,
  awaiting_inr: 0,
  oldest_unpaid_days: 4,
  due_inr: 100000,
  paid_inr: 60000,
  outstanding_inr: 40000,
  credit_inr: 0,
  waived_inr: 0,
  exchange_difference_inr: 0,
  written_off_inr: 0,
}

function renderTab(items: Record<string, unknown>[]) {
  vi.mocked(useFinanceSummary).mockReturnValue({ data: { payment_followups: 0 }, isLoading: false } as never)
  vi.mocked(useFinanceBalances).mockReturnValue({
    data: { items, meta: { total: items.length, next_cursor: null } },
    isLoading: false,
    isError: false,
  } as never)
  render(
    <MemoryRouter>
      <OverviewTab onGoToAwaiting={() => {}} onGoToOverdueCases={() => {}} />
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('Finance Overview — balances by consultancy and institute', () => {
  it('shows Waived, Credit, Exchange difference and Written off as served, so a row adds up', () => {
    // 70,000 − 5,000 + 3,000 + 16,249 + 15,751 = 100,000
    renderTab([
      {
        ...base,
        consultancy_id: 'c1',
        consultancy_name: 'Harbourline',
        due_inr: 100000,
        paid_inr: 70000,
        credit_inr: 5000,
        waived_inr: 3000,
        outstanding_inr: 16249,
        exchange_difference_inr: 15751,
        written_off_inr: 1250.5,
      },
    ])
    for (const h of ['Waived', 'Credit', 'Exchange difference', 'Written off']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(h) })).toBeInTheDocument()
    }
    expect(screen.getByText('₹5,000.00')).toBeInTheDocument()
    expect(screen.getByText('₹3,000.00')).toBeInTheDocument()
    expect(screen.getByText('₹15,751.00')).toBeInTheDocument()
    expect(screen.getByText('₹1,250.50')).toBeInTheDocument()
  })

  it('leaves out a column that is zero on every row, and a negative difference keeps its minus sign', () => {
    renderTab([
      { ...base, consultancy_id: 'c1', consultancy_name: 'Northstar', waived_inr: 200, exchange_difference_inr: -50.25 },
      { ...base, consultancy_id: 'c2', consultancy_name: 'Maple' },
    ])
    expect(screen.getByRole('columnheader', { name: /Waived/ })).toBeInTheDocument()
    expect(screen.getByText('-₹50.25')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /Credit/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /Written off/ })).not.toBeInTheDocument()
  })

  it('explains how a row adds up, in one short note under the table', () => {
    renderTab([{ ...base, consultancy_id: 'c1', consultancy_name: 'Northstar' }])
    expect(screen.getByText(/Due = Paid − Credit \+ Waived \+ Outstanding \+ Exchange difference\./)).toBeInTheDocument()
    expect(screen.getByText(/change in rupee value of foreign-currency dues since each payment was confirmed/)).toBeInTheDocument()
  })
})

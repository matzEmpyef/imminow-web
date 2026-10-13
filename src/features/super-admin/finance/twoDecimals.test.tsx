import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

// Phase 8 T1-05: every rupee figure on Finance arrives to the paisa and is written to the paisa. A
// tile reads exactly what the table under it sums to; nothing is rounded or re-summed here.
vi.mock('@/queries/financeDashboard', () => ({ useFinanceCases: vi.fn(), useFinanceVoidRequestCount: vi.fn() }))
vi.mock('@/queries/countries', () => ({ useCountries: () => ({ data: [] }) }))
vi.mock('./ConsultancySearchSelect', () => ({ ConsultancySearchSelect: () => null }))
vi.mock('./FinanceCaseDrawer', () => ({ FinanceCaseDrawer: () => null }))

import { useFinanceCases, useFinanceVoidRequestCount } from '@/queries/financeDashboard'
import { CasesTab } from './CasesTab'
import { FinanceSummaryTiles } from './FinanceSummaryTiles'

describe('Finance tiles', () => {
  it('write rupees with their paise, not to the whole rupee', () => {
    render(
      <MemoryRouter>
        <FinanceSummaryTiles
          summary={
            {
              cases: 2,
              outstanding_inr: 24354.88,
              expected_share_inr: 1234.5,
              awaiting: { count: 1, amount_inr: 50000.5 },
              overdue_inr: 0.12,
              received_this_month_inr: 139343.75,
              collected_inr: 50000.5,
              expected_inr: 100001.25,
              payment_followups_pending_inr: 99.99,
              payment_followups: 1,
            } as never
          }
          onAwaitingClick={() => {}}
          onOverdueClick={() => {}}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('₹24,354.88')).toBeInTheDocument()
    expect(screen.getByText('₹1,234.50')).toBeInTheDocument()
    expect(screen.getByText('₹50,000.50', { selector: 'span.text-caption' })).toBeInTheDocument()
    expect(screen.getByText('₹0.12')).toBeInTheDocument()
    expect(screen.getByText('₹1,39,343.75')).toBeInTheDocument()
    expect(screen.getByText(/₹50,000\.50 of ₹1,00,001\.25/)).toBeInTheDocument()
    expect(screen.getByText('₹99.99')).toBeInTheDocument()
  })
})

describe('Finance cases, rows and totals line', () => {
  it('show the paise the server sent, and the totals line is the server’s', () => {
    vi.mocked(useFinanceCases).mockReturnValue({
      data: {
        items: [
          {
            id: 'e1',
            applicant_name: 'Aiko Tanaka',
            consultancy_name: 'Alpha Consult',
            destination_country: 'Canada',
            college_name: 'Test College',
            rate_percent: 10,
            rate_source: 'configured',
            due_inr: 60000.25,
            expected_share_inr: 10.1,
            paid_inr: 57600.75,
            written_off_inr: 0,
            settled: false,
            outstanding_inr: 2399.5,
            overdue_inr: 0.12,
            next_due_on: null,
            payment_status: 'part_paid',
            accepted_at: '2026-09-01',
            case_closed: true,
            by_currency: [],
          },
        ],
        meta: { total: 1 },
        totals: {
          due_inr: 60000.25,
          expected_share_inr: 10.1,
          paid_inr: 57600.75,
          outstanding_inr: 2399.5,
          overdue_inr: 0.12,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as never)
    vi.mocked(useFinanceVoidRequestCount).mockReturnValue({ data: 0 } as never)
    render(
      <MemoryRouter>
        <CasesTab />
      </MemoryRouter>,
    )
    expect(
      screen.getByText(
        'Due ₹60,000.25 · Not yet due ₹10.10 · Paid ₹57,600.75 · Outstanding ₹2,399.50 · Overdue ₹0.12 for these filters',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('₹2,399.50')).toBeInTheDocument()
  })
})

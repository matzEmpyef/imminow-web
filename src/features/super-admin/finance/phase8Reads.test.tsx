import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 8, the finance reads: the Outstanding tile counts the cases that owe (T4-03), a payment row
// shows what Finance typed about it and the reference (T4-06), and the CSV is written from the
// server's own export strings (T4-04 to T4-06).
const REASON =
  'Declared as ₹2,576.90: Bank fee deducted | Corrected on 13-10-2026 from ₹2,500.00 to ₹2,576.90: The bank confirmed the full amount arrived'
const awaiting = {
  id: 'p1',
  status: 'declared',
  amount: { amount: 2576.9, currency: 'INR' },
  amount_inr: 2576.9,
  entry_outstanding_inr: 500,
  consultancy_name: 'Northstar',
  applicant_name: 'Ishaan Kapoor',
  transaction_id: 'UTR-EXPORT-1',
  reason_text: null,
  recorded_at: '2026-10-01T09:00:00Z',
}
const confirmed = {
  id: 'p2',
  status: 'confirmed',
  amount: { amount: 2576.9, currency: 'INR' },
  amount_inr: 2576.9,
  consultancy_name: 'Northstar',
  applicant_name: 'Ishaan Kapoor',
  transaction_id: 'UTR-EXPORT-1',
  reason_text: REASON,
  recorded_at: '2026-10-01T09:00:00Z',
  confirmed_at: '2026-10-13T09:00:00Z',
  confirmed_by_name: 'Devika',
  corrections: [],
  export: {
    date: '13-10-2026',
    status: 'Confirmed',
    currency: 'INR',
    amount: '2576.90',
    amount_inr: '2576.90',
    account: 'Northstar',
    applicant: 'Ishaan Kapoor',
    reference: 'UTR-EXPORT-1',
    declared_on: '01-10-2026',
    decided_on: '13-10-2026',
    decided_by: 'Devika',
    reason: REASON,
    settled_in: '',
    rate_used: '1',
    amount_settled: '',
  },
}

const download = vi.fn()
vi.mock('@/lib/csv', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csv')>()),
  downloadCsv: (...args: unknown[]) => download(...args),
}))
vi.mock('@/queries/financeDashboard', () => ({
  useFinancePayments: ({ status }: { status?: string }) => ({
    data: { items: status === 'declared' ? [awaiting] : [confirmed], meta: { next_cursor: null, total: 1 }, totals: { count: 1, amount_inr: 2576.9 } },
    isLoading: false,
    isError: false,
  }),
  fetchAllFinancePayments: vi.fn(async () => [confirmed]),
}))
vi.mock('@/queries/commission', () => ({
  useConfirmCommissionPayment: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  useConfirmPreview: () => ({ data: undefined, error: null, isFetching: false }),
  useRejectCommissionPayment: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('./ConsultancySearchSelect', () => ({ ConsultancySearchSelect: () => null }))
vi.mock('./CorrectPaymentModal', () => ({ CorrectPaymentModal: () => null }))

import { AwaitingTab } from './AwaitingTab'
import { FinanceSummaryTiles } from './FinanceSummaryTiles'
import { HistoryTab } from './HistoryTab'

beforeEach(() => download.mockReset())

describe('Finance Overview, the Outstanding tile', () => {
  const tiles = (summary: Record<string, unknown>) =>
    render(
      <MemoryRouter>
        <FinanceSummaryTiles
          summary={
            {
              cases: 40,
              outstanding_inr: 24354.88,
              expected_share_inr: 0,
              awaiting: { count: 0, amount_inr: 0 },
              overdue_inr: 0,
              received_this_month_inr: 0,
              collected_inr: 0,
              expected_inr: 0,
              ...summary,
            } as never
          }
          onAwaitingClick={() => {}}
          onOverdueClick={() => {}}
        />
      </MemoryRouter>,
    )

  it('counts the cases that owe, not every case with a record', () => {
    tiles({ cases_owing: 3 })
    expect(screen.getByText('across 3 cases')).toBeInTheDocument()
    expect(screen.queryByText('across 40 cases')).not.toBeInTheDocument()
  })

  it('reads "1 case" for one, and says nothing about a count it was not sent', () => {
    const { unmount } = tiles({ cases_owing: 1 })
    expect(screen.getByText('across 1 case')).toBeInTheDocument()
    unmount()
    tiles({})
    expect(screen.queryByText(/^across/)).not.toBeInTheDocument()
  })
})

describe('Awaiting confirmation rows', () => {
  it('show the reference the consultancy gave', () => {
    render(<AwaitingTab />)
    expect(within(screen.getByText('Northstar').closest('tr') as HTMLElement).getByText('UTR-EXPORT-1')).toBeInTheDocument()
  })
})

describe('Payment history', () => {
  it('shows what Finance typed about the payment, as served', () => {
    render(<HistoryTab />)
    expect(screen.getByText(REASON)).toBeInTheDocument()
  })

  it('writes the CSV from the served export strings', async () => {
    render(<HistoryTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    await waitFor(() => expect(download).toHaveBeenCalled())
    const csv = download.mock.calls[0][1] as string
    const [header, line] = csv.split('\r\n')
    expect(header.startsWith('Date,Status,Currency,Amount,Amount INR,Consultancy,Student,Reference')).toBe(true)
    expect(line.startsWith('13-10-2026,Confirmed,INR,2576.90,2576.90,Northstar,Ishaan Kapoor,UTR-EXPORT-1,01-10-2026,13-10-2026,Devika,"Declared as ₹2,576.90')).toBe(true)
  })
})

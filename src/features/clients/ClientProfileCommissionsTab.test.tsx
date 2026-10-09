import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Gate 12b / owner §15 Q5: a channel-B client's Commissions tab is the consultancy's own
// bookkeeping record — installments work as usual, no Sentpo share and no declare-payment control,
// plus a caption saying it is not shared with immiNow. With the fields absent (the frozen mock) the
// tab behaves as before.
vi.mock('@/queries/clients', () => ({ useClient: vi.fn(), useCommissions: vi.fn() }))
const permission = vi.hoisted(() => ({ canRecord: true }))
vi.mock('@/lib/permissions', () => ({ usePermission: () => permission.canRecord }))
vi.mock('@/components/CountryLabel', () => ({ CountryLabel: ({ name }: { name: string }) => <span>{name}</span> }))
vi.mock('./RecordInstallmentModal', () => ({ RecordInstallmentModal: () => null }))
vi.mock('./RecordPrContributionModal', () => ({ RecordPrContributionModal: () => null }))
vi.mock('./VoidInstallmentModal', () => ({ VoidInstallmentModal: () => null }))
vi.mock('./VoidPrContributionModal', () => ({
  VoidPrContributionModal: () => <div data-testid="void-pr-contribution" />,
}))

import { useClient, useCommissions } from '@/queries/clients'
import { CommissionsTab } from './ClientProfileCommissionsTab'
import { isBookkeepingChannel } from './bookkeeping'

const baseEntry = {
  id: 'entry-1',
  journey_id: 'j1',
  case_type: 'student',
  course_name: 'MSc Data Science',
  college_name: 'Test University',
  destination_country: 'United Kingdom',
  payer_method: 'college',
  expected_from_college: { amount: 100000, currency: 'INR' },
  expected_from_student: null,
  received_from_college: { amount: 25000, currency: 'INR' },
  received_from_student: null,
  course_start: null,
  status: 'active',
}

const installment = {
  id: 'inst-1',
  commission_entry_id: 'entry-1',
  source: 'college',
  amount: { amount: 25000, currency: 'INR' },
  received_on: '2026-09-30',
  note: null,
  receipt_id: null,
  created_at: '2026-09-30T08:00:00Z',
}

function setup(opts: {
  entry?: Record<string, unknown> | null
  client?: Record<string, unknown>
  installments?: Record<string, unknown>[]
}) {
  vi.mocked(useClient).mockReturnValue({ data: { case_type: 'student', ...opts.client } } as never)
  vi.mocked(useCommissions).mockReturnValue({
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    data: {
      entry: opts.entry === undefined ? baseEntry : opts.entry,
      installments: opts.installments ?? [installment],
      invoices: [],
      receipts: [],
    },
  } as never)
  return render(<CommissionsTab clientId="c1" />)
}

beforeEach(() => {
  permission.canRecord = true
  vi.mocked(useClient).mockReset()
  vi.mocked(useCommissions).mockReset()
})

describe('CommissionsTab, channel-B bookkeeping record', () => {
  it('explains it is the consultancy’s own record and shows no immiNow share or declare control', () => {
    setup({ entry: { ...baseEntry, channel: 'B' }, client: { acquisition_source: 'B' } })

    expect(screen.getByText(/your own record for this client/i)).toBeInTheDocument()
    expect(screen.getByText(/not shared with immiNow/i)).toBeInTheDocument()
    // No immiNow share, rate, dues or declare-payment anywhere.
    expect(screen.queryByText(/declare/i)).toBeNull()
    expect(screen.queryByText(/due to imminow/i)).toBeNull()
    expect(screen.queryByText(/imminow.s share/i)).toBeNull()
    expect(screen.queryByText(/rate/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /declare/i })).toBeNull()
    // Installments still work as normal.
    expect(screen.getByRole('button', { name: 'Record Payment' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Void' })).toBeInTheDocument()
  })

  it('shows the caption on an empty tab for a channel-B client with no entry yet', () => {
    setup({ entry: null, client: { acquisition_source: 'B' } })
    expect(screen.getByText(/not shared with immiNow/i)).toBeInTheDocument()
  })

  it('shows today’s tab, with no caption, when the channel fields are absent or not B', () => {
    const absent = setup({})
    expect(screen.queryByText(/not shared with immiNow/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Record Payment' })).toBeInTheDocument()
    absent.unmount()

    setup({ entry: { ...baseEntry, channel: 'A' }, client: { acquisition_source: 'A' } })
    expect(screen.queryByText(/not shared with immiNow/i)).toBeNull()
  })
})

describe('isBookkeepingChannel', () => {
  it('lets the entry’s own channel win, and falls back to the client’s source', () => {
    expect(isBookkeepingChannel('B', 'A')).toBe(true)
    expect(isBookkeepingChannel('A', 'B')).toBe(false)
    expect(isBookkeepingChannel(undefined, 'B')).toBe(true)
    expect(isBookkeepingChannel(null, 'B')).toBe(true)
    expect(isBookkeepingChannel(undefined, undefined)).toBe(false)
    expect(isBookkeepingChannel('C', 'C')).toBe(false)
  })
})

// Review F-160: the tab used to compare `expected` with `received` itself, and the two can be in
// different currencies: ₹60,000 received against CAD 1,000 expected read "fully paid". The entry
// now carries the server's own progress per payer, and the tab shows that and works out nothing.
const progress = (overrides: Record<string, unknown> = {}) => ({
  expected: { amount: 1000, currency: 'CAD' },
  received: { amount: 400, currency: 'CAD' },
  remaining: { amount: 600, currency: 'CAD' },
  shortfall_percent: 60,
  fully_paid: false,
  converted: false,
  ...overrides,
})

describe('CommissionsTab, expected against received', () => {
  it('shows the server’s expected, received and remaining, in the agreed currency', () => {
    setup({
      entry: {
        ...baseEntry,
        expected_from_college: { amount: 1000, currency: 'CAD' },
        // What arrived was rupees: the bare numbers say 60,000 against 1,000.
        received_from_college: { amount: 60000, currency: 'INR' },
        college_progress: progress(),
      },
    })
    const line = screen.getAllByTestId('expected-vs-received')[0]
    expect(line).toHaveAttribute('data-progress', 'server')
    expect(line).toHaveTextContent('400 / 1,000 CAD · CAD 600 remaining')
    expect(line).not.toHaveTextContent('fully paid')
    expect(line).not.toHaveTextContent('60,000')
  })

  it('says "fully paid" only when the server says so', () => {
    setup({
      entry: {
        ...baseEntry,
        // Equal bare numbers, and the server still says it is not fully paid.
        expected_from_college: { amount: 1000, currency: 'CAD' },
        received_from_college: { amount: 1000, currency: 'INR' },
        college_progress: progress({ received: { amount: 12, currency: 'CAD' }, remaining: { amount: 988, currency: 'CAD' } }),
      },
    })
    expect(screen.getAllByTestId('expected-vs-received')[0]).not.toHaveTextContent('fully paid')

    setup({
      entry: {
        ...baseEntry,
        college_progress: progress({
          received: { amount: 1000, currency: 'CAD' },
          remaining: { amount: 0, currency: 'CAD' },
          shortfall_percent: 0,
          fully_paid: true,
        }),
      },
    })
    expect(screen.getAllByTestId('expected-vs-received').at(-1)).toHaveTextContent('1,000 / 1,000 CAD · fully paid')
  })

  it('notes when some of it arrived in another currency and was converted', () => {
    setup({ entry: { ...baseEntry, college_progress: progress({ converted: true }) } })
    expect(screen.getByText(/arrived in another currency and is counted in CAD/)).toBeInTheDocument()
  })

  it('without progress from the server shows each amount in its own currency and judges nothing', () => {
    setup({
      entry: {
        ...baseEntry,
        expected_from_college: { amount: 1000, currency: 'CAD' },
        received_from_college: { amount: 1000, currency: 'CAD' },
      },
    })
    const line = screen.getAllByTestId('expected-vs-received')[0]
    expect(line).toHaveAttribute('data-progress', 'none')
    expect(line).toHaveTextContent('CAD 1,000 received · CAD 1,000 expected')
    expect(line).not.toHaveTextContent('fully paid')
    expect(line).not.toHaveTextContent('%')
  })
})

// Review F-078: voiding an installment whose share is already due waits for immiNow Finance.
describe('CommissionsTab, a void waiting for immiNow Finance', () => {
  it('shows the waiting state with the reason, in place of the Void control', () => {
    setup({
      installments: [
        { ...installment, voided_at: null, void_requested_at: '2026-10-07T09:00:00Z', void_request_reason: 'Entered twice' },
      ],
    })
    expect(screen.getByText('Waiting for immiNow Finance')).toBeInTheDocument()
    expect(screen.getByText(/Void requested on 07\/10\/2026 — Entered twice/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Void' })).toBeNull()
  })

  it('keeps the Void control on an installment with no request', () => {
    setup({})
    expect(screen.queryByText('Waiting for immiNow Finance')).toBeNull()
    expect(screen.getByRole('button', { name: 'Void' })).toBeInTheDocument()
  })
})

// Review F-081: a PR contribution is recorded and voided only by holders of `billing.record_payment`.
describe('CommissionsTab, a PR case’s contribution', () => {
  const prEntry = {
    ...baseEntry,
    case_type: 'pr',
    payer_method: 'applicant',
    expected_from_college: null,
    received_from_college: null,
    expected_from_student: { amount: 50000, currency: 'INR' },
  }

  it('offers Record only to a holder of the permission', () => {
    setup({ entry: null, client: { case_type: 'pr' } }).unmount()
    permission.canRecord = false
    setup({ entry: null, client: { case_type: 'pr' } })
    expect(screen.queryByRole('button', { name: 'Record Applicant Contribution' })).toBeNull()
  })

  it('offers Void contribution on a PR entry, and opens the reason dialog', () => {
    setup({ entry: prEntry, client: { case_type: 'pr' } })
    fireEvent.click(screen.getByRole('button', { name: 'Void contribution' }))
    expect(screen.getByTestId('void-pr-contribution')).toBeInTheDocument()
  })

  it('offers no Void contribution without the permission, or on a student case', () => {
    setup({}).unmount()
    expect(screen.queryByRole('button', { name: 'Void contribution' })).toBeNull()
    permission.canRecord = false
    setup({ entry: prEntry, client: { case_type: 'pr' } })
    expect(screen.queryByRole('button', { name: 'Void contribution' })).toBeNull()
  })
})

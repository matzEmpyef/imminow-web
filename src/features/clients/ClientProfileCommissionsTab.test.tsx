import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Gate 12b / owner §15 Q5: a channel-B client's Commissions tab is the consultancy's own
// bookkeeping record — installments work as usual, no Sentpo share and no declare-payment control,
// plus a caption saying it is not shared with Sentpo. With the fields absent (the frozen mock) the
// tab behaves as before.
vi.mock('@/queries/clients', () => ({ useClient: vi.fn(), useCommissions: vi.fn() }))
vi.mock('@/lib/permissions', () => ({ usePermission: () => true }))
vi.mock('@/components/CountryLabel', () => ({ CountryLabel: ({ name }: { name: string }) => <span>{name}</span> }))
vi.mock('./RecordInstallmentModal', () => ({ RecordInstallmentModal: () => null }))
vi.mock('./RecordPrContributionModal', () => ({ RecordPrContributionModal: () => null }))
vi.mock('./VoidInstallmentModal', () => ({ VoidInstallmentModal: () => null }))

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

function setup(opts: { entry?: Record<string, unknown> | null; client?: Record<string, unknown> }) {
  vi.mocked(useClient).mockReturnValue({ data: { case_type: 'student', ...opts.client } } as never)
  vi.mocked(useCommissions).mockReturnValue({
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    data: {
      entry: opts.entry === undefined ? baseEntry : opts.entry,
      installments: [installment],
      invoices: [],
      receipts: [],
    },
  } as never)
  return render(<CommissionsTab clientId="c1" />)
}

beforeEach(() => {
  vi.mocked(useClient).mockReset()
  vi.mocked(useCommissions).mockReset()
})

describe('CommissionsTab, channel-B bookkeeping record', () => {
  it('explains it is the consultancy’s own record and shows no Sentpo share or declare control', () => {
    setup({ entry: { ...baseEntry, channel: 'B' }, client: { acquisition_source: 'B' } })

    expect(screen.getByText(/your own record for this client/i)).toBeInTheDocument()
    expect(screen.getByText(/not shared with Sentpo/i)).toBeInTheDocument()
    // No Sentpo share, rate, dues or declare-payment anywhere.
    expect(screen.queryByText(/declare/i)).toBeNull()
    expect(screen.queryByText(/due to sentpo/i)).toBeNull()
    expect(screen.queryByText(/sentpo.s share/i)).toBeNull()
    expect(screen.queryByText(/rate/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /declare/i })).toBeNull()
    // Installments still work as normal.
    expect(screen.getByRole('button', { name: 'Record Payment' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Void' })).toBeInTheDocument()
  })

  it('shows the caption on an empty tab for a channel-B client with no entry yet', () => {
    setup({ entry: null, client: { acquisition_source: 'B' } })
    expect(screen.getByText(/not shared with Sentpo/i)).toBeInTheDocument()
  })

  it('shows today’s tab, with no caption, when the channel fields are absent or not B', () => {
    const absent = setup({})
    expect(screen.queryByText(/not shared with Sentpo/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Record Payment' })).toBeInTheDocument()
    absent.unmount()

    setup({ entry: { ...baseEntry, channel: 'A' }, client: { acquisition_source: 'A' } })
    expect(screen.queryByText(/not shared with Sentpo/i)).toBeNull()
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

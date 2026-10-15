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
  /** What the server says about the case itself: `case_closed`, `recording_allowed`. */
  summary?: Record<string, unknown>
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
      case_closed: false,
      recording_allowed: true,
      settling: false,
      ...opts.summary,
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

  it('says it once: the served sentence replaces the fixed caption on the consultancy’s own client', () => {
    const OWN = 'This is your own client, so no share is owed to immiNow on this case.'
    setup({
      entry: { ...baseEntry, channel: 'B' },
      client: { acquisition_source: 'B' },
      summary: { platform_share_note: OWN },
    })
    expect(screen.getByText(OWN)).toBeInTheDocument()
    expect(screen.queryByText(/your own record for this client/i)).toBeNull()
    expect(screen.queryByText(/not shared with immiNow/i)).toBeNull()
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
  it('writes the line in one money form: received of agreed, and what is still to come', () => {
    setup({
      entry: {
        ...baseEntry,
        college_progress: progress({
          expected: { amount: 4300, currency: 'AUD' },
          received: { amount: 0, currency: 'AUD' },
          remaining: { amount: 4300, currency: 'AUD' },
          shortfall_percent: 100,
        }),
      },
    })
    const line = screen.getAllByTestId('expected-vs-received')[0]
    expect(line).toHaveTextContent('AUD 0.00 of AUD 4,300.00 received · AUD 4,300.00 still to come')
    expect(line).not.toHaveTextContent('remaining')
    expect(line).not.toHaveTextContent(' / ')
  })


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
    expect(line).toHaveTextContent('CAD 400.00 of CAD 1,000.00 received · CAD 600.00 still to come')
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
    expect(screen.getAllByTestId('expected-vs-received').at(-1)).toHaveTextContent('CAD 1,000.00 of CAD 1,000.00 received · fully paid')
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
    expect(line).toHaveTextContent('CAD 1,000.00 received · CAD 1,000.00 expected')
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
    expect(screen.getByText(/Void requested on 07-10-2026 — Entered twice/)).toBeInTheDocument()
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

// T1-10: a case that has ended offers no way to record new money, and says why instead of inviting
// an entry. The server decides (`case_closed`, `recording_allowed`); nothing is read from the status.
const ended = { case_closed: true, recording_allowed: false }

describe('CommissionsTab, a closed case', () => {
  it('offers nothing to record on an empty tab, and says the case is closed', () => {
    setup({ entry: null, client: { case_type: 'pr' }, summary: ended })
    expect(screen.getByText(/This case is closed, so no commission is being tracked on it/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record Applicant Contribution' })).toBeNull()
    expect(screen.queryByText(/Record the applicant.s agreed contribution/)).toBeNull()
  })

  it('still invites a first entry on an open PR case', () => {
    setup({ entry: null, client: { case_type: 'pr' } })
    expect(screen.getByRole('button', { name: 'Record Applicant Contribution' })).toBeInTheDocument()
  })

  it('hides the contribution button when the server does not allow recording, even with no entry and no closed flag', () => {
    setup({ entry: null, client: { case_type: 'pr' }, summary: { recording_allowed: false } })
    expect(screen.queryByRole('button', { name: 'Record Applicant Contribution' })).toBeNull()
  })

  it('takes the record, void and contribution buttons away while the old figures are still on screen', () => {
    setup({ entry: { ...baseEntry, case_type: 'pr' }, client: { case_type: 'pr' }, summary: ended })
    expect(screen.getByText('PR case —', { exact: false })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record Payment' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Void' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Void contribution' })).toBeNull()
  })

  it('follows the server, not the client’s status: recording allowed means the buttons stay', () => {
    setup({ client: { status: 'closed', outcome: 'success' }, summary: { recording_allowed: true } })
    expect(screen.getByRole('button', { name: 'Record Payment' })).toBeInTheDocument()
  })
})

// Phase 8 T2-01 and T4-07: the tab says what immiNow's share on the case is (as served), and a case
// that closed without success shows its reversed record read-only, with the payments still listed.
describe('CommissionsTab, immiNow’s share and a reversed record', () => {
  const SHARE = 'immiNow’s share on this case is 10% of what you earn on it. ₹10,000.00 has fallen due; ₹4,000.00 is paid.'
  const REVERSED = 'This case closed without success, so its commission record was cancelled. The payments recorded on it are listed below.'

  it('shows the share note as served, and nothing when none is served', () => {
    const shown = setup({ summary: { platform_share_note: SHARE } })
    expect(screen.getByText(SHARE)).toBeInTheDocument()
    shown.unmount()
    setup({ summary: { platform_share_note: null } })
    expect(screen.queryByText(/immiNow’s share on this case/)).toBeNull()
  })

  it('on a reversed record: the note, a Reversed badge, the payments, and no way to add or void', () => {
    setup({
      entry: { ...baseEntry, status: 'reversed' },
      summary: { reversed: true, reversed_note: REVERSED, recording_allowed: true, case_closed: true },
    })
    expect(screen.getByText(REVERSED)).toBeInTheDocument()
    expect(screen.getByText('Reversed')).toBeInTheDocument()
    // The recorded payment stays listed.
    expect(screen.getByText('INR 25,000.00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record Payment' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Void' })).toBeNull()
  })

  it('on a live record: no Reversed badge, and the buttons stay', () => {
    setup({ summary: { reversed: false, reversed_note: null } })
    expect(screen.queryByText('Reversed')).toBeNull()
    expect(screen.getByRole('button', { name: 'Record Payment' })).toBeInTheDocument()
  })

  it('on a reversed PR record: Void contribution is not offered', () => {
    setup({
      entry: { ...baseEntry, case_type: 'pr', status: 'reversed' },
      client: { case_type: 'pr' },
      summary: { reversed: true, reversed_note: REVERSED },
    })
    expect(screen.queryByRole('button', { name: 'Void contribution' })).toBeNull()
  })
})

// Owner, DECISIONS 145e, 146, 147b: when Support moves a student with the accepted college, the
// case they left says where the admission went, and money that moved reads "Moved to {name}" on
// the first consultancy's instalments and "Moved from {name}" on the copy in the new one.
describe('CommissionsTab, an admission that moved with the student', () => {
  const NOTE =
    'The admission moved to Beta Consult on 14-10-2026, together with the money recorded on it. Nothing is owed here on it.'

  it('shows the served sentence, keeps the tab read-only and says "Moved to" instead of "Voided"', () => {
    setup({
      entry: { ...baseEntry, status: 'voided' },
      summary: { admission_moved_note: NOTE, recording_allowed: true, case_closed: true },
      installments: [
        {
          ...installment,
          voided_at: '2026-10-14T09:00:00Z',
          voided_by_name: 'Support',
          moved_to_consultancy_name: 'Beta Consult',
        },
      ],
    })
    expect(screen.getByText(NOTE)).toBeInTheDocument()
    expect(screen.getByText('Moved to Beta Consult')).toBeInTheDocument()
    expect(screen.getByText('Moved')).toBeInTheDocument()
    expect(screen.queryByText(/Voided/)).toBeNull()
    expect(screen.queryByText('Void')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Record Payment' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Void' })).toBeNull()
  })

  it('says "Moved from" on the copy in the new consultancy, which still counts like any instalment', () => {
    setup({ installments: [{ ...installment, moved_from_consultancy_name: 'Alpha Consult' }] })
    expect(screen.getByText('Moved from Alpha Consult')).toBeInTheDocument()
    expect(screen.queryByText('Moved to Alpha Consult')).toBeNull()
    expect(screen.getByRole('button', { name: 'Void' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record Payment' })).toBeInTheDocument()
  })

  it('still says "Voided" for an instalment that was only voided', () => {
    setup({ installments: [{ ...installment, voided_at: '2026-10-01T09:00:00Z', voided_by_name: 'Priya', voided_reason: 'Typed twice' }] })
    expect(screen.getByText(/Voided by Priya on 01-10-2026 — Typed twice/)).toBeInTheDocument()
  })

  it('shows no moved note on an ordinary case', () => {
    setup({})
    expect(screen.queryByText(NOTE)).toBeNull()
  })
})

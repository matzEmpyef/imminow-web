import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The money-correctness round (2026-10-08), on Finance's case drawer:
//   - "Mark as fully paid" appears only when the server's `settle_needs` on the part says the
//     signed-in person may use it; a settled part shows the written-off amount as its own figure,
//     who, when, why, and Undo;
//   - a consultancy's void of an installment waiting for Finance shows Approve / Decline.
const session = vi.hoisted(() => ({ superAdmin: false, finance: true }))
vi.mock('@/lib/me', () => ({
  useIsSuperAdmin: () => session.superAdmin,
  usePlatformPermission: () => session.finance,
}))
vi.mock('@/queries/financeDashboard', () => ({
  useSettleCommissionDue: vi.fn(),
  useVoidCommissionDue: vi.fn(),
  useDecideInstallmentVoid: vi.fn(),
  useAddCommissionDue: vi.fn(),
  useOverrideCommissionDue: vi.fn(),
  useReceiveCommissionDue: vi.fn(),
  useWaiveCommissionDue: vi.fn(),
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useDecideInstallmentVoid, useSettleCommissionDue, useVoidCommissionDue } from '@/queries/financeDashboard'
import { FinanceCaseDrawer } from './FinanceCaseDrawer'

const settleMutate = vi.fn()
const voidMutate = vi.fn()
const decideMutate = vi.fn()

function mutation(mutate: ReturnType<typeof vi.fn>, error: Error | null = null) {
  return { mutate, reset: vi.fn(), isPending: false, isError: Boolean(error), error } as never
}

const basePart = {
  key: 'p1',
  id: null,
  kind: 'calculated',
  source: 'tuition',
  status: 'due',
  currency: 'CAD',
  amount: 1000,
  paid: 960,
  outstanding: 40,
  due_on: '2026-10-01',
  written_off: 0,
  settled: false,
  settled_reason: null,
  settled_by_name: null,
  settled_at: null,
  settle_change_id: null,
  shortfall_percent: 4,
  settle_needs: 'finance',
  instalment_id: null,
  instalment_void_requested_at: null,
  instalment_void_request_reason: null,
}

function caseRow(part: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    applicant_name: 'Aiko Tanaka',
    consultancy_name: 'Alpha Consult',
    case_type: 'student',
    case_closed: true,
    rate_percent: 10,
    tuition_fee: { amount: 10000, currency: 'CAD' },
    due_inr: 60000,
    expected_share_inr: 0,
    paid_inr: 57600,
    written_off_inr: 0,
    awaiting_inr: 0,
    outstanding_inr: 2400,
    overdue_inr: 0,
    by_currency: [{ currency: 'CAD', due: 1000, expected: 0, paid: 960, outstanding: 40, overdue: 0, waived: 0, written_off: 0 }],
    due_schedule: [{ ...basePart, ...part }],
    due_changes: [],
    ...overrides,
  } as never
}

function openDrawer(part: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}, onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <FinanceCaseDrawer caseRow={caseRow(part, overrides)} onClose={onClose} />
    </MemoryRouter>,
  )
  return onClose
}

const dialog = (name: string) => screen.getByRole('dialog', { name })

beforeEach(() => {
  session.superAdmin = false
  session.finance = true
  settleMutate.mockReset()
  voidMutate.mockReset()
  decideMutate.mockReset()
  vi.mocked(useSettleCommissionDue).mockReturnValue(mutation(settleMutate))
  vi.mocked(useVoidCommissionDue).mockReturnValue(mutation(voidMutate))
  vi.mocked(useDecideInstallmentVoid).mockReturnValue(mutation(decideMutate))
})

describe('Mark as fully paid', () => {
  it('is offered to a Finance holder when the server says finance may settle', () => {
    openDrawer({ settle_needs: 'finance' })
    expect(screen.getByRole('button', { name: 'Mark as fully paid' })).toBeInTheDocument()
  })

  it('is hidden from a Finance holder when the server says a Super Admin is needed', () => {
    openDrawer({ settle_needs: 'super_admin', shortfall_percent: 8 })
    expect(screen.queryByRole('button', { name: 'Mark as fully paid' })).toBeNull()
  })

  it('is offered to a Super Admin either way', () => {
    session.superAdmin = true
    openDrawer({ settle_needs: 'super_admin', shortfall_percent: 8 })
    expect(screen.getByRole('button', { name: 'Mark as fully paid' })).toBeInTheDocument()
  })

  it('is never offered when the server says there is nothing to settle', () => {
    session.superAdmin = true
    openDrawer({ settle_needs: null })
    expect(screen.queryByRole('button', { name: 'Mark as fully paid' })).toBeNull()
  })

  it('shows the server’s percentage and amounts, needs a reason and sends a key', () => {
    openDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Mark as fully paid' }))
    const modal = within(dialog('Mark as fully paid'))
    expect(modal.getByText('CAD 1,000')).toBeInTheDocument()
    expect(modal.getByText('CAD 960')).toBeInTheDocument()
    expect(modal.getByText('CAD 40 · 4%')).toBeInTheDocument()

    const confirm = modal.getByRole('button', { name: 'Mark as fully paid' })
    expect(confirm).toBeDisabled()
    fireEvent.change(modal.getByLabelText(/Reason/), { target: { value: '  Bank charges  ' } })
    fireEvent.click(confirm)

    expect(settleMutate.mock.calls[0][0]).toMatchObject({ entryId: 'e1', part_key: 'p1', reason: 'Bank charges' })
    expect(settleMutate.mock.calls[0][0].idempotencyKey).toBeTruthy()
  })

  it('says a Super Admin must do it, with the server’s two percentages, on 403', () => {
    vi.mocked(useSettleCommissionDue).mockReturnValue(
      mutation(
        settleMutate,
        new ApiError(
          'x',
          {
            error: {
              code: 'permission_denied',
              message: 'Not allowed.',
              details: { shortfall_percent: 8.25, limit_percent: 5 },
            },
          },
          403,
        ),
      ),
    )
    openDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Mark as fully paid' }))
    expect(within(dialog('Mark as fully paid')).getByRole('alert')).toHaveTextContent(
      'This difference is 8.25%. Above 5% a Super Admin must do this.',
    )
  })

  it('shows the server’s own sentence on any other refusal', () => {
    vi.mocked(useSettleCommissionDue).mockReturnValue(
      mutation(settleMutate, new ApiError('x', { error: { code: 'conflict', message: 'This part is already paid.' } }, 409)),
    )
    openDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Mark as fully paid' }))
    expect(within(dialog('Mark as fully paid')).getByRole('alert')).toHaveTextContent('This part is already paid.')
  })
})

describe('a settled part', () => {
  const settled = {
    status: 'paid',
    amount: 960,
    paid: 960,
    outstanding: 0,
    written_off: 40,
    settled: true,
    settled_reason: 'Bank charges',
    settled_by_name: 'Priya Nair',
    settled_at: '2026-10-08T10:00:00Z',
    settle_change_id: 'chg-1',
    shortfall_percent: 0,
    settle_needs: null,
  }

  it('reads Settled, with the written-off amount as its own figure, who, when and why', () => {
    openDrawer(settled, { paid_inr: 57600, written_off_inr: 2400 })
    expect(screen.getByText('Settled')).toBeInTheDocument()
    expect(screen.getByText(/Written off CAD 40 by Priya Nair on 08\/10\/2026: Bank charges/)).toBeInTheDocument()
    // The case's written-off total is its own tile, beside Paid and not inside it.
    expect(screen.getByText('Written off (₹)').parentElement).toHaveTextContent('₹2,400')
    expect(screen.getByText('Paid (₹)').parentElement).toHaveTextContent('₹57,600')
    expect(screen.queryByRole('button', { name: 'Mark as fully paid' })).toBeNull()
  })

  it('is undone through the dues void, with the part’s settle_change_id', () => {
    openDrawer(settled)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    const modal = within(dialog('Undo CAD 40 written off'))
    fireEvent.change(modal.getByLabelText(/Reason/), { target: { value: 'Settled by mistake' } })
    fireEvent.click(modal.getByRole('button', { name: 'Undo' }))
    expect(voidMutate.mock.calls[0][0]).toEqual({ entryId: 'e1', changeId: 'chg-1', reason: 'Settled by mistake' })
  })
})

describe('a void of an installment waiting for Finance', () => {
  const waiting = {
    source: 'college_instalment',
    instalment_amount: { amount: 5000, currency: 'CAD' },
    instalment_received_on: '2026-09-30',
    settle_needs: null,
    instalment_id: 'inst-1',
    instalment_void_requested_at: '2026-10-07T09:00:00Z',
    instalment_void_request_reason: 'Entered twice',
  }

  it('shows the request with its reason, and no decision controls on any other part', () => {
    openDrawer(waiting)
    expect(screen.getByText('Void requested')).toBeInTheDocument()
    expect(screen.getByText(/asked to void this installment on 07\/10\/2026: Entered twice/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument()
  })

  it('has no Approve or Decline when nothing is waiting', () => {
    openDrawer()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull()
  })

  it('approves without a reason', () => {
    openDrawer(waiting)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    fireEvent.click(within(dialog('Approve the void')).getByRole('button', { name: 'Approve and void' }))
    expect(decideMutate.mock.calls[0][0]).toEqual({ entryId: 'e1', installmentId: 'inst-1', approve: true, reason: undefined })
  })

  it('needs a reason to decline', () => {
    openDrawer(waiting)
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    const modal = within(dialog('Decline the void'))
    const confirm = modal.getByRole('button', { name: 'Decline' })
    expect(confirm).toBeDisabled()
    fireEvent.change(modal.getByLabelText(/Reason/), { target: { value: 'The money was received' } })
    fireEvent.click(confirm)
    expect(decideMutate.mock.calls[0][0]).toEqual({
      entryId: 'e1',
      installmentId: 'inst-1',
      approve: false,
      reason: 'The money was received',
    })
  })

  it('keeps the drawer open after an approval and shows the returned row, without the voided part', () => {
    const returned = caseRow({}, { applicant_name: 'Aiko Tanaka (refreshed)', due_schedule: [], outstanding_inr: 0 })
    decideMutate.mockImplementation((_vars, options: { onSuccess: (row: unknown) => void }) => options.onSuccess(returned))
    const onClose = openDrawer(waiting)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    fireEvent.click(within(dialog('Approve the void')).getByRole('button', { name: 'Approve and void' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Aiko Tanaka (refreshed)' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Approve the void' })).toBeNull()
    expect(screen.queryByText('Void requested')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('keeps the drawer open after a decline and shows the part with its request cleared', () => {
    const returned = caseRow(
      { source: 'college_instalment', settle_needs: null, instalment_id: 'inst-1' },
      { applicant_name: 'Aiko Tanaka (refreshed)' },
    )
    decideMutate.mockImplementation((_vars, options: { onSuccess: (row: unknown) => void }) => options.onSuccess(returned))
    const onClose = openDrawer(waiting)
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    const modal = within(dialog('Decline the void'))
    fireEvent.change(modal.getByLabelText(/Reason/), { target: { value: 'The money was received' } })
    fireEvent.click(modal.getByRole('button', { name: 'Decline' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Aiko Tanaka (refreshed)' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Decline the void' })).toBeNull()
    expect(screen.queryByText('Void requested')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull()
  })

  it.each(['conflict', 'already_voided', 'part_settled'])('shows the server’s sentence on 409 %s', (code) => {
    vi.mocked(useDecideInstallmentVoid).mockReturnValue(
      mutation(decideMutate, new ApiError('x', { error: { code, message: `Refused: ${code}.` } }, 409)),
    )
    openDrawer(waiting)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(within(dialog('Approve the void')).getByRole('alert')).toHaveTextContent(`Refused: ${code}.`)
  })
})

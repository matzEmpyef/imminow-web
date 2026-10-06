import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-153. Bulk confirm and bulk payout send one row at a time. Closing the dialog used to
// leave the loop running out of sight, and a partial failure said how many failed, not which.
// Now: no way to close while a batch runs, "Stop after this one" ends it between two rows, and
// every row has its own result.
const confirmOne = vi.fn()
const recordOne = vi.fn()
vi.mock('@/queries/commission', () => ({ useConfirmCommissionPayment: () => ({ mutateAsync: confirmOne }) }))
vi.mock('@/queries/freelancerReferrals', () => ({ useRecordFreelancerPayout: () => ({ mutateAsync: recordOne }) }))

import { Modal } from '@/components/Modal'
import { batchSummary, useBatchRun } from '@/lib/useBatchRun'
import { BulkRecordPayoutModal } from '../freelancers/BulkRecordPayoutModal'
import { BulkConfirmModal } from './BulkConfirmModal'

interface Pending {
  resolve: () => void
  reject: (error: Error) => void
}

/** Each call waits until the test settles it, so the test decides what overlaps with what. */
function controllable(mock: ReturnType<typeof vi.fn>): Pending[] {
  const pending: Pending[] = []
  mock.mockImplementation(
    () => new Promise<void>((resolve, reject) => pending.push({ resolve: () => resolve(), reject })),
  )
  return pending
}

const payment = (id: string, consultancy: string, amount: number) =>
  ({
    id,
    consultancy_name: consultancy,
    applicant_name: `Applicant ${id}`,
    amount: { amount, currency: 'INR' },
    amount_inr: amount,
  }) as never

const PAYMENTS = [payment('p1', 'Alpha Consult', 1000), payment('p2', 'Beta Abroad', 2000), payment('p3', 'Gamma Global', 3000)]

const rowOf = (text: string) => screen.getByText(text).closest('li') as HTMLElement

beforeEach(() => {
  confirmOne.mockReset()
  recordOne.mockReset()
})

describe('bulk confirm', () => {
  function open(onClose = vi.fn(), onDone = vi.fn()) {
    render(<BulkConfirmModal payments={PAYMENTS} onClose={onClose} onDone={onDone} />)
    return { onClose, onDone }
  }

  it('cannot be closed while the batch runs: no X, no Cancel, only "Stop after this one"', async () => {
    const pending = controllable(confirmOne)
    open()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm received' }))
    await waitFor(() => expect(pending).toHaveLength(1))

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop after this one' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Confirming 1 of 3… Keep this window open until it finishes.')
  })

  it('stops between two payments: the one in flight finishes, the rest are never sent', async () => {
    const pending = controllable(confirmOne)
    const { onDone } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm received' }))
    await waitFor(() => expect(pending).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: 'Stop after this one' }))
    expect(screen.getByRole('button', { name: 'Stopping…' })).toBeDisabled()
    await act(async () => pending[0].resolve())

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 confirmed. 2 not sent.'))
    expect(confirmOne).toHaveBeenCalledTimes(1)
    expect(within(rowOf('Alpha Consult')).getByText('Confirmed')).toBeInTheDocument()
    expect(within(rowOf('Beta Abroad')).getByText('Not sent')).toBeInTheDocument()
    expect(within(rowOf('Gamma Global')).getByText('Not sent')).toBeInTheDocument()
    expect(screen.getByText(/still awaiting confirmation\. Confirm those one at a time\./)).toBeInTheDocument()
    // Closable again, and the list behind it is refreshed.
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('names each payment that failed, with the reason, and carries on with the rest', async () => {
    const pending = controllable(confirmOne)
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm received' }))
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => pending[0].resolve())
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () => pending[1].reject(new Error('This payment was already rejected.')))
    await waitFor(() => expect(pending).toHaveLength(3))
    await act(async () => pending[2].resolve())

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 confirmed. 1 failed.'))
    const failed = rowOf('Beta Abroad')
    expect(within(failed).getByText('Failed')).toBeInTheDocument()
    expect(within(failed).getByText('This payment was already rejected.')).toBeInTheDocument()
    expect(within(rowOf('Alpha Consult')).getByText('Confirmed')).toBeInTheDocument()
    expect(within(rowOf('Gamma Global')).getByText('Confirmed')).toBeInTheDocument()
  })

  it('keeps showing the batch that was started when the selection behind it empties', async () => {
    const pending = controllable(confirmOne)
    const { rerender } = render(<BulkConfirmModal payments={PAYMENTS} onClose={vi.fn()} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm received' }))
    await waitFor(() => expect(pending).toHaveLength(1))
    // The awaiting list refreshes as payments are confirmed and they leave the selection.
    rerender(<BulkConfirmModal payments={[]} onClose={vi.fn()} onDone={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Confirm 3 selected payments' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
})

describe('bulk payout', () => {
  const referral = (id: string, freelancer: string, owed: number) =>
    ({ id, freelancer_name: freelancer, applicant_name: `Applicant ${id}`, owed_inr: owed }) as never
  const REFERRALS = [referral('r1', 'Meera Pillai', 5000), referral('r2', 'Arjun Das', 7000)]

  it('locks while it runs, stops between payouts, and gives a result for each', async () => {
    const pending = controllable(recordOne)
    render(<BulkRecordPayoutModal referrals={REFERRALS} onClose={vi.fn()} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Record 2 payouts/ }))
    await waitFor(() => expect(pending).toHaveLength(1))

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stop after this one' }))
    await act(async () => pending[0].reject(new Error('Bank details are missing.')))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('0 recorded. 1 failed. 1 not sent.'))
    expect(recordOne).toHaveBeenCalledTimes(1)
    expect(within(rowOf('Meera Pillai')).getByText('Bank details are missing.')).toBeInTheDocument()
    expect(within(rowOf('Arjun Das')).getByText('Not sent')).toBeInTheDocument()
    expect(screen.getByText('Payouts marked Failed or Not sent were not recorded. Record those one at a time.')).toBeInTheDocument()
  })

  it('says only what happened when every payout went through', async () => {
    recordOne.mockResolvedValue(undefined)
    render(<BulkRecordPayoutModal referrals={REFERRALS} onClose={vi.fn()} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Record 2 payouts/ }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 recorded.'))
    expect(screen.queryByText(/were not recorded/)).not.toBeInTheDocument()
  })
})

describe('useBatchRun', () => {
  it('runs the rows in order, one at a time', async () => {
    const order: string[] = []
    const { result } = renderHook(() =>
      useBatchRun<string>(async (item) => {
        order.push(`start ${item}`)
        await Promise.resolve()
        order.push(`end ${item}`)
      }),
    )
    await act(async () => result.current.start(['a', 'b']))
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b'])
    expect(result.current.finished).toBe(true)
    expect(result.current.running).toBe(false)
    expect(result.current.counts).toEqual({ done: 2, failed: 0, skipped: 0 })
  })

  it('a second start while one is running does nothing', async () => {
    let release!: () => void
    const runOne = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    const { result } = renderHook(() => useBatchRun<string>(runOne))
    act(() => {
      void result.current.start(['a'])
      void result.current.start(['a'])
    })
    await waitFor(() => expect(runOne).toHaveBeenCalledTimes(1))
    await act(async () => release())
    expect(runOne).toHaveBeenCalledTimes(1)
  })

  it('summarises only the parts that apply', () => {
    expect(batchSummary({ done: 3, failed: 0, skipped: 0 }, 'confirmed')).toBe('3 confirmed.')
    expect(batchSummary({ done: 1, failed: 2, skipped: 3 }, 'recorded')).toBe('1 recorded. 2 failed. 3 not sent.')
  })
})

describe('a locked Modal', () => {
  it('has no close control and does not close on Escape or the backdrop', () => {
    const onClose = vi.fn()
    render(
      <Modal onClose={onClose} title="Working" locked dismissible>
        <p>In progress</p>
      </Modal>,
    )
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('is closable as usual when not locked', () => {
    const onClose = vi.fn()
    render(
      <Modal onClose={onClose} title="Idle">
        <p>Nothing running</p>
      </Modal>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

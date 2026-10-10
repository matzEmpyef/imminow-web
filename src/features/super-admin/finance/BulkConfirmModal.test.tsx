import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-300: the bulk-confirm dialog does not judge a changed amount. A row whose amount was
// changed asks the server's confirm preview (its own request, after a pause in its own typing) and
// shows the note box only when the server says `needs_note`. A row left as declared asks nothing.
const confirmOne = vi.fn()
vi.mock('@/queries/commission', () => ({
  useConfirmCommissionPayment: () => ({ mutateAsync: confirmOne }),
  useConfirmPreview: vi.fn(),
}))

import { ApiError } from '@/api/errors'
import { useConfirmPreview } from '@/queries/commission'
import { BulkConfirmModal } from './BulkConfirmModal'

const payment = (id: string, consultancy: string, amount: number) =>
  ({
    id,
    consultancy_name: consultancy,
    applicant_name: `Applicant ${id}`,
    amount: { amount, currency: 'INR' },
    amount_inr: amount,
  }) as never

const PAYMENTS = [payment('p1', 'Alpha Consult', 1000), payment('p2', 'Beta Abroad', 2000)]

type Answer = Record<string, unknown>
/** What the server's preview answers, per payment id and amount asked; nothing is worked out by the dialog. */
let answers: Record<string, (amount: number | undefined) => Answer | Error>

const answer = (needsNote: boolean): Answer => ({ differs: needsNote, needs_note: needsNote })

function install() {
  vi.mocked(useConfirmPreview).mockImplementation(((id: string, amount: number | undefined, enabled = true) => {
    if (!enabled) return { data: undefined, error: null, isFetching: false } as never
    const result = answers[id]?.(amount)
    if (result instanceof Error) return { data: undefined, error: result, isFetching: false } as never
    return { data: result, error: null, isFetching: false } as never
  }) as never)
}

const calls = (id: string) => vi.mocked(useConfirmPreview).mock.calls.filter((c) => c[0] === id)
const lastCall = (id: string) => calls(id)[calls(id).length - 1]
const amountBox = (consultancy: string) =>
  within(screen.getByText(consultancy).closest('div.rounded-md') as HTMLElement).getByLabelText(/Amount received/)
const rowOf = (consultancy: string) => screen.getByText(consultancy).closest('div.rounded-md') as HTMLElement
const confirmButton = () => screen.getByRole('button', { name: 'Confirm received' })

beforeEach(() => {
  confirmOne.mockReset()
  confirmOne.mockResolvedValue(undefined)
  vi.mocked(useConfirmPreview).mockReset()
  answers = {}
  install()
})

describe('bulk confirm, a changed amount', () => {
  function open() {
    render(<BulkConfirmModal payments={PAYMENTS} onClose={vi.fn()} onDone={vi.fn()} />)
  }

  it('asks nothing for rows left as declared', () => {
    open()
    for (const id of ['p1', 'p2']) expect(calls(id).every((c) => c[2] === false)).toBe(true)
    expect(confirmButton()).toBeEnabled()
    expect(screen.queryByLabelText(/Why is it different/)).not.toBeInTheDocument()
  })

  it('asks for the changed row only, once its typing pauses, with its own amount', async () => {
    open()
    fireEvent.change(amountBox('Alpha Consult'), { target: { value: '900' } })
    // Typing is not followed by a request on every key.
    expect(lastCall('p1')[1]).not.toBe(900)
    await waitFor(() => expect(lastCall('p1').slice(0, 3)).toEqual(['p1', 900, true]))
    // The other row did not move, and asks nothing.
    expect(calls('p2').every((c) => c[2] === false)).toBe(true)
  })

  it('asks nothing for an amount with a third decimal or none', async () => {
    open()
    fireEvent.change(amountBox('Alpha Consult'), { target: { value: '900.123' } })
    await waitFor(() => expect(lastCall('p1')[2]).toBe(false))
    fireEvent.change(amountBox('Alpha Consult'), { target: { value: '' } })
    await waitFor(() => expect(lastCall('p1')[2]).toBe(false))
    expect(confirmButton()).toBeDisabled()
  })

  it('holds the button while the answer for a changed row is awaited', () => {
    answers.p1 = () => undefined as never
    vi.mocked(useConfirmPreview).mockImplementation((() => ({ data: undefined, error: null, isFetching: true })) as never)
    open()
    fireEvent.change(amountBox('Alpha Consult'), { target: { value: '900' } })
    expect(confirmButton()).toBeDisabled()
  })

  it('shows the note box only when the server says the change needs one, and sends the note with that row', async () => {
    answers.p1 = (amount) => (amount === 900 ? answer(true) : answer(false))
    open()
    fireEvent.change(amountBox('Alpha Consult'), { target: { value: '900' } })
    const why = await within(rowOf('Alpha Consult')).findByLabelText(/Why is it different/)
    expect(within(rowOf('Beta Abroad')).queryByLabelText(/Why is it different/)).not.toBeInTheDocument()
    expect(confirmButton()).toBeDisabled()
    fireEvent.change(why, { target: { value: 'Bank fee taken' } })
    expect(confirmButton()).toBeEnabled()
    fireEvent.click(confirmButton())
    await waitFor(() => expect(confirmOne).toHaveBeenCalledTimes(2))
    expect(confirmOne).toHaveBeenNthCalledWith(1, { paymentId: 'p1', receivedAmount: 900, note: 'Bank fee taken' })
    expect(confirmOne).toHaveBeenNthCalledWith(2, { paymentId: 'p2', receivedAmount: 2000, note: undefined })
  })

  it('needs no note when the server says the change does not differ', async () => {
    answers.p1 = () => answer(false)
    open()
    fireEvent.change(amountBox('Alpha Consult'), { target: { value: '1000.00' } })
    await waitFor(() => expect(lastCall('p1')[1]).toBe(1000))
    await waitFor(() => expect(confirmButton()).toBeEnabled())
    expect(screen.queryByLabelText(/Why is it different/)).not.toBeInTheDocument()
    fireEvent.click(confirmButton())
    await waitFor(() => expect(confirmOne).toHaveBeenCalled())
    expect(confirmOne.mock.calls[0][0]).toEqual({ paymentId: 'p1', receivedAmount: 1000, note: undefined })
  })

  it('returns to asking nothing when the row is typed back to the declared text', async () => {
    answers.p1 = () => answer(true)
    open()
    fireEvent.change(amountBox('Alpha Consult'), { target: { value: '900' } })
    await within(rowOf('Alpha Consult')).findByLabelText(/Why is it different/)
    fireEvent.change(amountBox('Alpha Consult'), { target: { value: '1000' } })
    expect(within(rowOf('Alpha Consult')).queryByLabelText(/Why is it different/)).not.toBeInTheDocument()
    expect(confirmButton()).toBeEnabled()
  })

  it('shows the server’s sentence on the row when its preview refuses, and does not stop the typing', async () => {
    answers.p1 = () => new ApiError('x', { error: { code: 'conflict', message: 'This payment is no longer awaiting confirmation.' } }, 409)
    open()
    fireEvent.change(amountBox('Alpha Consult'), { target: { value: '900' } })
    expect(await within(rowOf('Alpha Consult')).findByText('This payment is no longer awaiting confirmation.')).toBeInTheDocument()
    expect(amountBox('Alpha Consult')).toBeEnabled()
    await waitFor(() => expect(confirmButton()).toBeEnabled())
  })

  it('keeps the plain total of the ticked rows as it was', () => {
    open()
    expect(screen.getByText(/Total declared: ₹3,000\.00/)).toBeInTheDocument()
  })
})

import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A commission payment declaration is money: a second one is a duplicate payment. One
// Idempotency-Key per opened modal and content; an "already recorded" answer closes the modal,
// refreshes and tells the user, and never offers a resubmit.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { ALREADY_APPLIED_NOTICE } from '@/lib/useIdempotencyKey'
import { alreadyApplied, resolveAnswer, sentKey, type WriteAnswer } from '@/test/writeAnswers'
import { RecordPlatformPaymentModal } from './RecordPlatformPaymentModal'

const mockedPost = vi.mocked(api.POST)

// The full suite runs these under load; a slow first render must not fail a correct test.
configure({ asyncUtilTimeout: 5000 })

let answers: WriteAnswer[]

const due = {
  id: 'entry-1',
  applicant_name: 'Asha Rao',
  case_type: 'college',
  college_name: 'Northern College',
  by_currency: [{ currency: 'INR', outstanding: 5000 }],
  platform_due: { amount: 5000, currency: 'INR' },
  platform_outstanding: { amount: 5000, currency: 'INR' },
  platform_expected: { amount: 0, currency: 'INR' },
  platform_paid: { amount: 0, currency: 'INR' },
  platform_awaiting: { amount: 0, currency: 'INR' },
} as never

function paymentCalls() {
  return (mockedPost.mock.calls as unknown[][]).filter((call) => call[0] === '/commission/payments')
}

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <RecordPlatformPaymentModal due={due} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose, invalidate }
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Declare' }))
}

beforeEach(() => {
  answers = []
  mockedPost.mockReset()
  vi.mocked(showToast).mockClear()
  mockedPost.mockImplementation((async () => resolveAnswer(answers.shift() ?? { ok: true })) as never)
})

describe('RecordPlatformPaymentModal — duplicate protection', () => {
  it('an already-applied answer closes the modal, refreshes, says so and does not resubmit', async () => {
    answers = [alreadyApplied()]
    const { onClose, invalidate } = renderModal()
    submit()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(showToast).toHaveBeenCalledWith(ALREADY_APPLIED_NOTICE)
    expect(showToast).toHaveBeenCalledTimes(1)
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['commission'])
    expect(paymentCalls()).toHaveLength(1)
  })

  it('two attempts with unchanged content carry the same key; edited content gets a new one', async () => {
    answers = [{ networkError: true }, { status: 502, code: 'bad_gateway', message: 'upstream' }, { ok: true }]
    renderModal()

    submit()
    await waitFor(() => expect(paymentCalls()).toHaveLength(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Declare' })).toBeEnabled())
    submit()
    await waitFor(() => expect(paymentCalls()).toHaveLength(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Declare' })).toBeEnabled())

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '4000' } })
    submit()
    await waitFor(() => expect(paymentCalls()).toHaveLength(3))

    const [first, second, third] = paymentCalls()
    expect(sentKey(first)).toMatch(/^[0-9a-f-]{36}$/)
    expect(sentKey(second)).toBe(sentKey(first))
    expect(sentKey(third)).not.toBe(sentKey(first))
  })

  it('a 422 idempotency_key_reused shows the server message and renews the key', async () => {
    answers = [{ status: 422, code: 'idempotency_key_reused', message: 'This key was already used for a different request.' }]
    renderModal()

    submit()
    expect(await screen.findByText('This key was already used for a different request.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Declare' })).toBeEnabled())
    submit()
    await waitFor(() => expect(paymentCalls()).toHaveLength(2))
    const [first, second] = paymentCalls()
    expect(sentKey(second)).not.toBe(sentKey(first))
  })
})

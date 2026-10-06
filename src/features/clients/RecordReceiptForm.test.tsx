import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A receipt is money: a second one is a duplicate payment. The form keeps one Idempotency-Key per
// opened form and content; when the server says the write already went through (the first answer
// was lost) the form closes, refreshes and tells the user — it never offers a resubmit.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { useAuthStore } from '@/stores/authStore'
import { ALREADY_APPLIED_NOTICE } from '@/lib/useIdempotencyKey'
import { alreadyApplied, resolveAnswer, sentKey, type WriteAnswer } from '@/test/writeAnswers'
import { RecordReceiptForm } from './ReceiptsPage'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

// The full suite runs these under load; a slow first render must not fail a correct test.
configure({ asyncUtilTimeout: 5000 })

let answers: WriteAnswer[]

function receiptCalls() {
  return (mockedPost.mock.calls as unknown[][]).filter((call) => call[0] === '/receipts')
}

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <RecordReceiptForm onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose, invalidate }
}

async function fill(amount: string) {
  const invoice = (await screen.findByRole('option', { name: /INV-1/ })) as HTMLOptionElement
  fireEvent.change(screen.getByLabelText('Invoice'), { target: { value: invoice.value } })
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: amount } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }))
}

beforeEach(() => {
  answers = []
  mockedGet.mockReset()
  mockedPost.mockReset()
  vi.mocked(showToast).mockClear()
  useAuthStore.setState({ accessToken: 'test-token' })
  mockedGet.mockImplementation((async () => ({
    data: {
      items: [
        {
          id: 'inv-1',
          number: 'INV-1',
          applicant_name: 'Asha Rao',
          status: 'sent',
          journey_id: 'j1',
          amount: { amount: 50000, currency: 'INR' },
        },
      ],
      meta: { next_cursor: null, total: 1 },
    },
    error: undefined,
  })) as never)
  mockedPost.mockImplementation((async () => resolveAnswer(answers.shift() ?? { ok: true })) as never)
})

describe('RecordReceiptForm — duplicate protection', () => {
  it.each(['conflict', 'request_in_progress'])(
    'an already-applied answer (code %s) closes the form, refreshes, says so and does not resubmit',
    async (code) => {
      answers = [alreadyApplied(code)]
      const { onClose, invalidate } = renderForm()
      await fill('1000')
      submit()

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
      expect(showToast).toHaveBeenCalledWith(ALREADY_APPLIED_NOTICE)
      expect(showToast).toHaveBeenCalledTimes(1)
      // The same lists the success path refreshes.
      const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
      expect(keys).toContainEqual(['invoices'])
      expect(keys).toContainEqual(['receipts'])
      // No second write (the page unmounts the form on close; the mocked onClose does not).
      expect(receiptCalls()).toHaveLength(1)
    },
  )

  it('two attempts with unchanged content carry the same key; edited content gets a new one', async () => {
    answers = [{ networkError: true }, { status: 502, code: 'bad_gateway', message: 'upstream' }, { ok: true }]
    renderForm()
    await fill('1000')

    submit()
    await waitFor(() => expect(receiptCalls()).toHaveLength(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record Payment' })).toBeEnabled())
    submit()
    await waitFor(() => expect(receiptCalls()).toHaveLength(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record Payment' })).toBeEnabled())

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '900' } })
    submit()
    await waitFor(() => expect(receiptCalls()).toHaveLength(3))

    const [first, second, third] = receiptCalls()
    expect(sentKey(first)).toMatch(/^[0-9a-f-]{36}$/)
    expect(sentKey(second)).toBe(sentKey(first))
    expect(sentKey(third)).not.toBe(sentKey(first))
  })

  it('a 422 idempotency_key_reused shows the server message and renews the key', async () => {
    answers = [{ status: 422, code: 'idempotency_key_reused', message: 'This key was already used for a different request.' }]
    renderForm()
    await fill('1000')

    submit()
    expect(await screen.findByText('This key was already used for a different request.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record Payment' })).toBeEnabled())
    submit()
    await waitFor(() => expect(receiptCalls()).toHaveLength(2))
    const [first, second] = receiptCalls()
    expect(sentKey(second)).not.toBe(sentKey(first))
  })
})

import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// An invoice is money: a second one is a duplicate bill. One Idempotency-Key per opened form and
// content; an "already recorded" answer closes the form, refreshes and tells the user, and never
// offers a resubmit.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/consultancy', () => ({ useMyConsultancy: () => ({ data: { billing_currency: 'INR' } }) }))
// The real picker searches the server; here it only has to choose an applicant.
vi.mock('@/components/ServerSearchSelect', () => ({
  ServerSearchSelect: ({ onChange }: { onChange: (id: string, row: unknown) => void }) => (
    <button type="button" onClick={() => onChange('j1', { student: { first_name: 'Asha', last_name: 'Rao' } })}>
      Pick applicant
    </button>
  ),
}))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { ALREADY_APPLIED_NOTICE } from '@/lib/useIdempotencyKey'
import { alreadyApplied, resolveAnswer, sentKey, type WriteAnswer } from '@/test/writeAnswers'
import { CreateInvoiceForm } from './InvoicesPage'

const mockedPost = vi.mocked(api.POST)

// The full suite runs these under load; a slow first render must not fail a correct test.
configure({ asyncUtilTimeout: 5000 })

let answers: WriteAnswer[]

function invoiceCalls() {
  return (mockedPost.mock.calls as unknown[][]).filter((call) => call[0] === '/invoices')
}

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <CreateInvoiceForm onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose, invalidate }
}

function fill(amount: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Pick applicant' }))
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Service fee' } })
  fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: amount } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Create Invoice' }))
}

beforeEach(() => {
  answers = []
  mockedPost.mockReset()
  vi.mocked(showToast).mockClear()
  mockedPost.mockImplementation((async () => resolveAnswer(answers.shift() ?? { ok: true }, { journey_id: 'j1' })) as never)
})

describe('CreateInvoiceForm — duplicate protection', () => {
  it('an already-applied answer closes the form, refreshes, says so and does not resubmit', async () => {
    answers = [alreadyApplied()]
    const { onClose, invalidate } = renderForm()
    fill('5000')
    submit()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(showToast).toHaveBeenCalledWith(ALREADY_APPLIED_NOTICE)
    expect(showToast).toHaveBeenCalledTimes(1)
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['invoices'])
    expect(keys).toContainEqual(['receipts'])
    expect(keys).toContainEqual(['clients', 'j1', 'commissions'])
    expect(invoiceCalls()).toHaveLength(1)
  })

  it('two attempts with unchanged content carry the same key; edited content gets a new one', async () => {
    answers = [{ networkError: true }, { status: 502, code: 'bad_gateway', message: 'upstream' }, { ok: true }]
    renderForm()
    fill('5000')

    submit()
    await waitFor(() => expect(invoiceCalls()).toHaveLength(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Invoice' })).toBeEnabled())
    submit()
    await waitFor(() => expect(invoiceCalls()).toHaveLength(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Invoice' })).toBeEnabled())

    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '4500' } })
    submit()
    await waitFor(() => expect(invoiceCalls()).toHaveLength(3))

    const [first, second, third] = invoiceCalls()
    expect(sentKey(first)).toMatch(/^[0-9a-f-]{36}$/)
    expect(sentKey(second)).toBe(sentKey(first))
    expect(sentKey(third)).not.toBe(sentKey(first))
  })

  it('a 422 idempotency_key_reused shows the server message and renews the key', async () => {
    answers = [{ status: 422, code: 'idempotency_key_reused', message: 'This key was already used for a different request.' }]
    renderForm()
    fill('5000')

    submit()
    expect(await screen.findByText('This key was already used for a different request.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Invoice' })).toBeEnabled())
    submit()
    await waitFor(() => expect(invoiceCalls()).toHaveLength(2))
    const [first, second] = invoiceCalls()
    expect(sentKey(second)).not.toBe(sentKey(first))
  })
})

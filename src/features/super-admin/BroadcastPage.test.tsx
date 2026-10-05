import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// F-037: a broadcast cannot be unsent, and `Idempotency-Key` is the only thing that stops a retry
// after a lost answer from notifying everyone twice. The key used to be made per ATTEMPT, so the
// retry was a second broadcast. Pinned here: one key per opened dialog and content; a new key when
// the content changes; and after an unclear failure the sender is told it may have gone out and
// shown the send history instead of being handed the same Send button.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { useAuthStore } from '@/stores/authStore'
import { SendBroadcastModal } from './BroadcastPage'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

type SendAnswer = { ok: true } | { networkError: true } | { status: number; code: string; message: string }

/** Answers for successive `POST /broadcast` calls, in order; the reach estimate always answers. */
let sendAnswers: SendAnswer[]

function sendCalls() {
  return (mockedPost.mock.calls as unknown[][]).filter((call) => call[0] === '/broadcast')
}

function sentKey(call: unknown[]): string {
  return (call[1] as { params: { header: { 'Idempotency-Key': string } } }).params.header['Idempotency-Key']
}

function sentBody(call: unknown[]): { title: string; body: string } {
  return (call[1] as { body: { title: string; body: string } }).body
}

function renderModal(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SendBroadcastModal onClose={onClose} />
    </QueryClientProvider>,
  )
  return onClose
}

function fillDraft(title = 'Intake deadline', body = 'Applications close Friday.') {
  const dialog = screen.getByRole('dialog', { name: 'Send Broadcast' })
  fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: title } })
  fireEvent.change(within(dialog).getByLabelText('Body'), { target: { value: body } })
  const category = within(dialog).getByLabelText('Category') as HTMLSelectElement
  fireEvent.change(category, { target: { value: category.options[1].value } })
}

/** Compose form -> confirmation -> the irreversible button. */
async function sendFromDraft() {
  const compose = screen.getByRole('dialog', { name: 'Send Broadcast' })
  await waitFor(() => expect(within(compose).getByRole('button', { name: 'Send Broadcast' })).toBeEnabled())
  fireEvent.click(within(compose).getByRole('button', { name: 'Send Broadcast' }))
  fireEvent.click(await screen.findByRole('button', { name: /^Send to 180000 students$/ }))
}

beforeEach(() => {
  sendAnswers = []
  mockedGet.mockReset()
  mockedPost.mockReset()
  vi.mocked(showToast).mockClear()
  useAuthStore.setState({ accessToken: 'test-token' })
  mockedGet.mockImplementation((async (path: string) => {
    if (path === '/broadcast') {
      return {
        data: {
          items: [{ id: 'b1', title: 'Yesterday\'s notice', status: 'sent', created_at: '2026-10-05T09:00:00Z' }],
          meta: { next_cursor: null, total: 1 },
        },
        error: undefined,
      }
    }
    return { data: { items: [], meta: { next_cursor: null, total: 0 } }, error: undefined }
  }) as never)
  mockedPost.mockImplementation((async (path: string) => {
    if (path === '/broadcast/audience-count') return { data: { count: 180000 }, error: undefined }
    const answer = sendAnswers.shift() ?? { ok: true }
    if ('networkError' in answer) throw new TypeError('Failed to fetch')
    if ('ok' in answer) return { data: { id: 'new' }, error: undefined, response: { status: 202 } }
    return {
      data: undefined,
      error: { error: { code: answer.code, message: answer.message, request_id: 'r1' } },
      response: { status: answer.status },
    }
  }) as never)
})

describe('SendBroadcastModal — duplicate protection', () => {
  it('a second attempt from the same dialog with the same content carries the same Idempotency-Key', async () => {
    sendAnswers = [{ networkError: true }, { ok: true }]
    const onClose = renderModal()
    fillDraft()

    await sendFromDraft()
    await screen.findByRole('dialog', { name: 'This broadcast may have been sent' })
    fireEvent.click(screen.getByRole('button', { name: 'Back to draft' }))
    await sendFromDraft()

    await waitFor(() => expect(sendCalls()).toHaveLength(2))
    const [first, second] = sendCalls()
    expect(sentKey(first)).toMatch(/^[0-9a-f-]{36}$/)
    expect(sentKey(second)).toBe(sentKey(first))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(showToast).toHaveBeenCalledWith('Broadcast sent')
  })

  it('edited content gets a new key', async () => {
    sendAnswers = [{ status: 502, code: 'bad_gateway', message: 'upstream' }, { ok: true }]
    renderModal()
    fillDraft()

    await sendFromDraft()
    await screen.findByRole('dialog', { name: 'This broadcast may have been sent' })
    fireEvent.click(screen.getByRole('button', { name: 'Back to draft' }))
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Applications close Monday.' } })
    await sendFromDraft()

    await waitFor(() => expect(sendCalls()).toHaveLength(2))
    const [first, second] = sendCalls()
    expect(sentBody(second).body).toBe('Applications close Monday.')
    expect(sentKey(second)).not.toBe(sentKey(first))
  })

  it('each opened dialog has its own key', async () => {
    renderModal()
    fillDraft()
    await sendFromDraft()
    await waitFor(() => expect(sendCalls()).toHaveLength(1))

    cleanup() // closed; opened again below
    renderModal()
    fillDraft()
    await sendFromDraft()
    await waitFor(() => expect(sendCalls()).toHaveLength(2))

    expect(sentKey(sendCalls()[1])).not.toBe(sentKey(sendCalls()[0]))
  })

  it('after an unclear failure it says the broadcast may have been sent and shows the history, not a Send button', async () => {
    sendAnswers = [{ networkError: true }]
    const onClose = renderModal()
    fillDraft()
    await sendFromDraft()

    const dialog = await screen.findByRole('dialog', { name: 'This broadcast may have been sent' })
    expect(within(dialog).getByText(/may or may not have gone out/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /^Send/ })).toBeNull()
    expect(within(dialog).queryByText('Failed to fetch')).toBeNull()
    // The newest history rows, fetched fresh, so the sender can see whether it went out.
    expect(await within(dialog).findByText("Yesterday's notice")).toBeInTheDocument()
    expect(within(dialog).getByText('Intake deadline')).toBeInTheDocument() // the draft is not lost

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close and view send history' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(sendCalls()).toHaveLength(1)
  })

  it('keeps the warning on the draft and the confirmation after going back', async () => {
    sendAnswers = [{ networkError: true }]
    renderModal()
    fillDraft()
    await sendFromDraft()
    await screen.findByRole('dialog', { name: 'This broadcast may have been sent' })
    fireEvent.click(screen.getByRole('button', { name: 'Back to draft' }))

    const compose = screen.getByRole('dialog', { name: 'Send Broadcast' })
    expect(within(compose).getByText(/An earlier attempt may already have been sent/)).toBeInTheDocument()
    fireEvent.click(within(compose).getByRole('button', { name: 'Send Broadcast' }))
    const confirm = await screen.findByRole('dialog', { name: 'Send to 180000 students?' })
    expect(within(confirm).getByText(/An earlier attempt may already have been sent/)).toBeInTheDocument()
    expect(within(confirm).queryByText('Failed to fetch')).toBeNull()
  })

  it('a clear refusal stays on the confirmation with the server\'s message, and the next attempt is a new write', async () => {
    sendAnswers = [{ status: 429, code: 'rate_limited', message: 'Too many broadcasts this hour.' }, { ok: true }]
    renderModal()
    fillDraft()
    await sendFromDraft()

    const confirm = await screen.findByRole('dialog', { name: 'Send to 180000 students?' })
    expect(await within(confirm).findByText(/Too many broadcasts this hour\. Wait a while before sending another\./)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'This broadcast may have been sent' })).toBeNull()

    // The server keeps a refusal under its key and would replay it; a fresh key makes this a new write.
    fireEvent.click(within(confirm).getByRole('button', { name: /^Send to 180000 students$/ }))
    await waitFor(() => expect(sendCalls()).toHaveLength(2))
    expect(sentKey(sendCalls()[1])).not.toBe(sentKey(sendCalls()[0]))
  })
})

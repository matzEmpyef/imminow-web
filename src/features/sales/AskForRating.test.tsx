import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// "Ask for rating" on a lead conversation (owner decision 16, review F-012). The server decides
// whether a consultant may ask, and what "enough conversation" means is a hidden setting: the
// consultant only ever sees one fixed sentence, with no number in it. Pinned here: each state of
// the control, and that a refusal of the request itself shows the server's own words.
vi.mock('@/api/client', () => ({ api: { POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { AskForRatingButton, NOT_ENOUGH_CONVERSATION } from './AskForRatingButton'
import { RequestRatingModal } from './RequestRatingModal'

const mockedPost = vi.mocked(api.POST)

type LeadState = Parameters<typeof AskForRatingButton>[0]['lead']

function renderButton(lead: LeadState) {
  const onAsk = vi.fn()
  const view = render(<AskForRatingButton lead={lead} onAsk={onAsk} />)
  return { onAsk, ...view }
}

describe('the Ask for rating control', () => {
  it('is a working button when the server says the consultant may ask', () => {
    const { onAsk } = renderButton({ can_request_rating: true, rating_request_blocked_reason: null })
    const button = screen.getByRole('button', { name: 'Ask for rating' })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(onAsk).toHaveBeenCalledTimes(1)
  })

  it('is disabled with exactly the fixed sentence when there is not enough conversation', () => {
    const { onAsk, container } = renderButton({
      can_request_rating: false,
      rating_request_blocked_reason: 'not_enough_conversation',
      rating_cooldown_ends_at: null,
    })
    const button = screen.getByRole('button', { name: 'Ask for rating' })
    expect(button).toBeDisabled()
    expect(screen.getByText('Not enough conversation yet to ask for a rating')).toBeInTheDocument()
    expect(button).toHaveAccessibleDescription('Not enough conversation yet to ask for a rating')
    fireEvent.click(button)
    expect(onAsk).not.toHaveBeenCalled()
    // No number anywhere: no count, no "x more messages", no days.
    expect(container.textContent).not.toMatch(/\d/)
  })

  it('never puts a number in the fixed sentence', () => {
    expect(NOT_ENOUGH_CONVERSATION).toBe('Not enough conversation yet to ask for a rating')
    expect(NOT_ENOUGH_CONVERSATION).not.toMatch(/\d/)
  })

  it('is disabled as "Rating requested recently" with the date the server gave', () => {
    renderButton({
      can_request_rating: false,
      rating_request_blocked_reason: 'asked_recently',
      rating_cooldown_ends_at: '2026-10-13T09:00:00Z',
    })
    expect(screen.getByRole('button', { name: 'Rating requested recently' })).toBeDisabled()
    expect(screen.getByText(/^until .*2026/)).toBeInTheDocument()
  })

  it('shows no "until" when the server gave no date', () => {
    const { container } = renderButton({
      can_request_rating: false,
      rating_request_blocked_reason: 'asked_recently',
      rating_cooldown_ends_at: null,
    })
    expect(screen.getByRole('button', { name: 'Rating requested recently' })).toBeDisabled()
    expect(container.textContent).not.toMatch(/until/)
  })

  it('is disabled with nothing beneath when the server gave no reason', () => {
    const { container } = renderButton({ can_request_rating: false, rating_request_blocked_reason: null })
    expect(screen.getByRole('button', { name: 'Ask for rating' })).toBeDisabled()
    expect(container.textContent).toBe('Ask for rating')
  })

  it('ignores a stale reason once the server says the consultant may ask', () => {
    const { container } = renderButton({
      can_request_rating: true,
      rating_request_blocked_reason: 'not_enough_conversation',
    })
    expect(screen.getByRole('button', { name: 'Ask for rating' })).toBeEnabled()
    expect(container.textContent).toBe('Ask for rating')
  })
})

describe('sending the request', () => {
  let client: QueryClient
  const onClose = vi.fn()

  function renderModal() {
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <RequestRatingModal leadId="lead-1" leadName="Meera Pillai" onClose={onClose} />
      </QueryClientProvider>,
    )
  }

  function refuse(status: number, code: string, message: string) {
    mockedPost.mockResolvedValueOnce({
      data: undefined,
      error: { error: { code, message, request_id: 'r1' } },
      response: { status },
    } as never)
  }

  beforeEach(() => {
    mockedPost.mockReset()
    onClose.mockClear()
    vi.mocked(showToast).mockClear()
  })

  it('says what asking does, without a count of messages', () => {
    renderModal()
    const dialog = screen.getByRole('dialog', { name: 'Ask for rating' })
    expect(dialog).toHaveTextContent('This asks Meera Pillai to rate their experience with you so far.')
    expect(dialog).toHaveTextContent(
      'You can ask this person again after 7 days. They see a prompt in their chat and a notification; the rating itself is anonymous and averages into your score.',
    )
    expect(dialog.textContent).not.toMatch(/message|turn|character/i)
  })

  it('sends the request and closes with a confirmation', async () => {
    mockedPost.mockResolvedValueOnce({ data: undefined, error: undefined, response: { status: 204 } } as never)
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(mockedPost).toHaveBeenCalledWith('/leads/{id}/rating-request', { params: { path: { id: 'lead-1' } } })
    expect(showToast).toHaveBeenCalledWith('Rating request sent to Meera Pillai')
  })

  it("shows the server's message on 409 not_enough_conversation and stays open", async () => {
    refuse(409, 'not_enough_conversation', 'Not enough conversation yet to ask for a rating.')
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough conversation yet to ask for a rating.')
    expect(onClose).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })

  it("shows the server's message on 429", async () => {
    refuse(429, 'rate_limited', 'You have asked this student for a rating recently. Try again later.')
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have asked this student for a rating recently. Try again later.',
    )
  })

  it('reads the lead again after a refusal, so the button takes the state the server now gives', async () => {
    refuse(409, 'not_enough_conversation', 'Not enough conversation yet to ask for a rating.')
    renderModal()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await screen.findByRole('alert')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['leads', 'lead-1'] })
  })

  it('falls back to plain words when the failure carries no message', async () => {
    mockedPost.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

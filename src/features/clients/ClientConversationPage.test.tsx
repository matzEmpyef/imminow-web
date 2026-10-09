import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Case-moved read-only state (product owner 2026-09-24): a `closed_switched` case's chat 409s
// `case_moved` on send, so the composer is replaced by a note up front — same `composerLocked`
// idiom ChatPanel already uses for an unallocated lead — instead of letting the send fail.
vi.mock('@/features/auth/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/queries/clients', () => ({
  useClient: vi.fn(),
  useClientMessages: vi.fn(),
  useSendClientMessage: vi.fn(),
  useMarkClientRead: vi.fn(),
}))
vi.mock('@/stores/chatWindowStore', () => ({ useChatWindowStore: vi.fn() }))
// The read marker is the shared hook's business (review F-143) and has its own test; it reaches
// for the lead and internal markers too, which this page's mocks do not cover.
vi.mock('@/lib/useMarkThreadRead', () => ({ useMarkThreadRead: vi.fn(), newestIncomingId: () => null }))

import { useClient, useClientMessages, useMarkClientRead, useSendClientMessage } from '@/queries/clients'
import { useChatWindowStore } from '@/stores/chatWindowStore'
import { ClientConversationPage } from './ClientConversationPage'
import { ApiError } from '@/api/errors'

const mockedClient = vi.mocked(useClient)
const mockedMessages = vi.mocked(useClientMessages)
const mockedSend = vi.mocked(useSendClientMessage)
const mockedMarkRead = vi.mocked(useMarkClientRead)
const mockedChatWindowStore = vi.mocked(useChatWindowStore)

function query<T>(data: T, overrides: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, refetch: vi.fn(), ...overrides } as never
}

function conversation() {
  return (
    <MemoryRouter initialEntries={['/clients/c1/conversation']}>
      <Routes>
        <Route path="/clients/:id/conversation" element={<ClientConversationPage />} />
      </Routes>
    </MemoryRouter>
  )
}

function renderConversation() {
  return render(conversation())
}

const CASE_CLOSED_NOTE = 'This case is closed, so its chat is read-only.'
const aiko = (status: string) => query({ student: { first_name: 'Aiko', last_name: 'Tanaka' }, status, case_type: 'student' })

beforeEach(() => {
  mockedMessages.mockReturnValue({
    items: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    hasEarlier: false,
    loadingEarlier: false,
    loadEarlier: vi.fn(),
  } as never)
  mockedSend.mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  mockedMarkRead.mockReturnValue({ mutate: vi.fn() } as never)
  mockedChatWindowStore.mockReturnValue(vi.fn())
  // jsdom has no layout engine, so it doesn't implement scrollIntoView — ChatPanel's
  // auto-scroll-to-latest effect calls it unconditionally on mount.
  Element.prototype.scrollIntoView = vi.fn()
})

describe('ClientConversationPage — case moved to another consultancy', () => {
  it('replaces the composer with a read-only note instead of a send box', () => {
    mockedClient.mockReturnValue(query({ student: { first_name: 'Aiko', last_name: 'Tanaka' }, status: 'closed_switched', case_type: 'student' }))
    renderConversation()

    expect(
      screen.getByText(
        'This case has moved to another consultancy — you can read the history, but nothing more can be sent.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Write a message…')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument()
  })

  it('keeps the ordinary composer for a live case', () => {
    mockedClient.mockReturnValue(query({ student: { first_name: 'Aiko', last_name: 'Tanaka' }, status: 'in_plan', case_type: 'student' }))
    renderConversation()

    expect(screen.getByPlaceholderText('Write a message…')).toBeInTheDocument()
    expect(
      screen.queryByText('This case has moved to another consultancy — you can read the history, but nothing more can be sent.'),
    ).not.toBeInTheDocument()
  })
})

// A closed case's chat is read-only on the full page too (owner ruling 2026-10-06, review
// F-086/F-115): `closed` and `closed_completed` show one line in place of the composer and of
// Suggest a course. The server's 409 `case_closed` on a send does the same at once, and the
// composer is back as soon as the case is reopened, with no reload.
describe('ClientConversationPage — closed case', () => {
  it.each(['closed', 'closed_completed'])('shows a %s case with one line and nothing to send with', (status) => {
    mockedClient.mockReturnValue(aiko(status))
    renderConversation()

    expect(screen.getByText(CASE_CLOSED_NOTE)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Write a message…')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suggest a course' })).not.toBeInTheDocument()
  })

  it.each(['closed', 'closed_completed'])('does not invite a hello into an empty %s case', (status) => {
    mockedClient.mockReturnValue(aiko(status))
    renderConversation()
    expect(screen.getByText('No messages in this conversation.')).toBeInTheDocument()
    expect(screen.queryByText(/say hello/)).not.toBeInTheDocument()
  })

  it('still invites a hello into an empty thread of a live case', () => {
    mockedClient.mockReturnValue(aiko('in_plan'))
    renderConversation()
    expect(screen.getByText('No messages yet — say hello.')).toBeInTheDocument()
  })

  it('leaves a moved case with its own wording', () => {
    mockedClient.mockReturnValue(aiko('closed_switched'))
    renderConversation()
    expect(screen.queryByText(CASE_CLOSED_NOTE)).not.toBeInTheDocument()
  })

  it('turns read-only on the server’s 409 case_closed, and gets the composer back after Reopen', () => {
    const send = vi.fn((_content: string, options: { onError: (error: unknown) => void }) =>
      options.onError(new ApiError('Could not send this message.', { error: { code: 'case_closed', message: CASE_CLOSED_NOTE } }, 409)),
    )
    mockedSend.mockReturnValue({ mutate: send, isPending: false } as never)
    mockedClient.mockReturnValue(aiko('in_plan'))
    const view = renderConversation()

    fireEvent.change(screen.getByPlaceholderText('Write a message…'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(screen.getByText(CASE_CLOSED_NOTE)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Write a message…')).not.toBeInTheDocument()

    // The case is read again (closed), then reopened from its profile: the same mounted page.
    mockedClient.mockReturnValue(aiko('closed'))
    view.rerender(conversation())
    expect(screen.getByText(CASE_CLOSED_NOTE)).toBeInTheDocument()
    mockedClient.mockReturnValue(aiko('in_plan'))
    view.rerender(conversation())
    expect(screen.getByPlaceholderText('Write a message…')).toBeInTheDocument()
    expect(screen.queryByText(CASE_CLOSED_NOTE)).not.toBeInTheDocument()
  })
})

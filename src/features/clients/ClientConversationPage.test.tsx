import { render, screen } from '@testing-library/react'
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

import { useClient, useClientMessages, useMarkClientRead, useSendClientMessage } from '@/queries/clients'
import { useChatWindowStore } from '@/stores/chatWindowStore'
import { ClientConversationPage } from './ClientConversationPage'

const mockedClient = vi.mocked(useClient)
const mockedMessages = vi.mocked(useClientMessages)
const mockedSend = vi.mocked(useSendClientMessage)
const mockedMarkRead = vi.mocked(useMarkClientRead)
const mockedChatWindowStore = vi.mocked(useChatWindowStore)

function query<T>(data: T, overrides: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, refetch: vi.fn(), ...overrides } as never
}

function renderConversation() {
  render(
    <MemoryRouter initialEntries={['/clients/c1/conversation']}>
      <Routes>
        <Route path="/clients/:id/conversation" element={<ClientConversationPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockedMessages.mockReturnValue(query({ items: [] }))
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

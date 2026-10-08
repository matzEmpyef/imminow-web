import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A closed conversation opens read-only (owner ruling 2026-10-06, review F-086/F-115): the chat
// drawer hands the window `closed: true` for a closed lead or client, and the window shows the
// thread with one line where the composer would be. Internal rows carry `closed: false`, and a
// window opened from a page carries no `closed` at all; neither is closed.
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/queries/leads', () => ({ useLead: vi.fn(), useLeadMessages: vi.fn(), useSendLeadMessage: vi.fn() }))
vi.mock('@/queries/clients', () => ({ useClient: vi.fn(), useClientMessages: vi.fn(), useSendClientMessage: vi.fn() }))
vi.mock('@/queries/internalMessages', () => ({
  useInternalConversationMessages: vi.fn(),
  useSendInternalMessage: vi.fn(),
  useUnsendInternalMessage: vi.fn(),
}))
vi.mock('@/lib/useMarkThreadRead', () => ({ useMarkThreadRead: vi.fn(), newestIncomingId: () => null }))
vi.mock('@/lib/realtime', () => ({ useViewingThread: vi.fn() }))
vi.mock('@/features/clients/SuggestCourseInChat', () => ({ SuggestCourseInChat: () => null }))

import { useLead, useLeadMessages, useSendLeadMessage } from '@/queries/leads'
import { useClient, useClientMessages, useSendClientMessage } from '@/queries/clients'
import {
  useInternalConversationMessages,
  useSendInternalMessage,
  useUnsendInternalMessage,
} from '@/queries/internalMessages'
import { useChatWindowStore, type ChatWindowConversation } from '@/stores/chatWindowStore'
import { CLOSED_CONVERSATION_NOTE } from '@/lib/closedThread'
import { ApiError } from '@/api/errors'
import { FloatingChatWindow } from './FloatingChatWindow'

const thread = {
  items: [{ id: 'm1', sender: 'student', content: 'Thank you for the help', created_at: '2026-09-01T10:00:00Z' }],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  hasEarlier: false,
  loadingEarlier: false,
  loadEarlier: vi.fn(),
}

function show(conversation: ChatWindowConversation) {
  useChatWindowStore.setState({ conversation, minimized: false })
  render(<FloatingChatWindow />)
}

beforeEach(() => {
  vi.mocked(useLeadMessages).mockReturnValue(thread as never)
  vi.mocked(useClientMessages).mockReturnValue(thread as never)
  vi.mocked(useInternalConversationMessages).mockReturnValue({
    data: { pages: [{ items: [] }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  } as never)
  vi.mocked(useLead).mockReturnValue({ data: { assigned_employee_id: 'e1', origin: 'sentpo', student_id: 's1' } } as never)
  vi.mocked(useClient).mockReturnValue({ data: { status: 'in_plan', case_type: 'student', student: { first_name: 'Asha' } } } as never)
  for (const hook of [useSendLeadMessage, useSendClientMessage, useSendInternalMessage, useUnsendInternalMessage]) {
    vi.mocked(hook).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as never)
  }
  // jsdom has no layout engine: ChatPanel scrolls to the latest message on mount.
  Element.prototype.scrollIntoView = vi.fn()
})

describe('the floating chat window', () => {
  it.each(['lead', 'client'] as const)('shows a closed %s thread with no composer and one line saying why', (type) => {
    show({ id: 'x1', type, name: 'Asha Nair', closed: true })

    expect(screen.getByText('Thank you for the help')).toBeInTheDocument()
    expect(screen.getByText(CLOSED_CONVERSATION_NOTE)).toBeInTheDocument()
    expect(CLOSED_CONVERSATION_NOTE).toBe('This conversation is closed and read-only.')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('keeps the composer on an open conversation', () => {
    show({ id: 'x1', type: 'lead', name: 'Asha Nair', closed: false })
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.queryByText(CLOSED_CONVERSATION_NOTE)).not.toBeInTheDocument()
  })

  it('does not read an internal row (`closed: false`) or a window with no flag as closed', () => {
    show({ id: 'team', type: 'internal', name: 'Whole Team', closed: false })
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.queryByText(CLOSED_CONVERSATION_NOTE)).not.toBeInTheDocument()
  })

  it('a window opened from a page, which carries no flag, keeps its composer', () => {
    show({ id: 'x1', type: 'client', name: 'Asha Nair' })
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  // Such a window has no flag to go by, so the lead or case itself is asked, as on the full pages.
  it.each(['closed', 'closed_completed'])('a window opened from a page on a %s case is read-only', (status) => {
    vi.mocked(useClient).mockReturnValue({ data: { status, case_type: 'student', student: { first_name: 'Asha' } } } as never)
    show({ id: 'x1', type: 'client', name: 'Asha Nair' })
    expect(screen.getByText('This case is closed, so its chat is read-only.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('a window opened from a page on a closed lead is read-only', () => {
    vi.mocked(useLead).mockReturnValue({ data: { status: 'closed', assigned_employee_id: 'e1', origin: 'sentpo' } } as never)
    show({ id: 'x1', type: 'lead', name: 'Asha Nair' })
    expect(screen.getByText(CLOSED_CONVERSATION_NOTE)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('turns read-only when the server refuses a send with 409 case_closed', () => {
    const sentence = 'This case is closed, so its chat is read-only.'
    vi.mocked(useSendClientMessage).mockReturnValue({
      mutate: (_content: string, options: { onError: (error: unknown) => void }) =>
        options.onError(new ApiError('Could not send this message.', { error: { code: 'case_closed', message: sentence } }, 409)),
      isPending: false,
    } as never)
    show({ id: 'x1', type: 'client', name: 'Asha Nair' })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(screen.getByText(sentence)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

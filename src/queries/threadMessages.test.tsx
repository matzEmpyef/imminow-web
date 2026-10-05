import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { components } from '@/api/schema'

// F-029: lead and client chats showed the newest 20 messages and nothing said more existed; for a
// converted client the earlier lead conversation and the divider before it were never shown.
// Pinned here on the real conversation page and the real hooks: the first page is the newest
// messages, "Load earlier" sends the server's cursor back untouched and prepends without
// duplicates or reordering, a live message lands once at the bottom without refetching any page,
// and the spliced lead history and its session break appear once paging reaches them.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/features/auth/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { api } from '@/api/client'
import { applyChatMessage } from '@/lib/realtime/queryCache'
import { useRealtimeStore } from '@/lib/realtime/store'
import { useAuthStore } from '@/stores/authStore'
import { ClientConversationPage } from '@/features/clients/ClientConversationPage'

type LeadMessage = components['schemas']['LeadMessage']

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

function message(id: string, minute: number, overrides: Partial<LeadMessage> = {}): LeadMessage {
  return {
    id,
    sender: 'student',
    content: `message ${id}`,
    created_at: new Date(Date.UTC(2026, 8, 1, 9, minute)).toISOString(),
    ...overrides,
  }
}

// A converted client, oldest first: ten messages from the lead conversation, the server's
// session-break marker, then thirty-five messages on the case.
const LEAD_HISTORY = Array.from({ length: 10 }, (_, i) => message(`l${i + 1}`, i))
const SESSION_BREAK = message('break-1', 10, { type: 'session_break', content: 'Became an applicant' })
const CASE_THREAD = Array.from({ length: 35 }, (_, i) => message(`c${i + 1}`, 11 + i))

/** What the server answers for the newest page; replaced by a test that adds a message. */
let newestPage: LeadMessage[]
// The older page repeats c6, as happens when a message arrives between the two requests and the
// page boundary moves by one.
const OLDER_PAGE = [...LEAD_HISTORY, SESSION_BREAK, ...CASE_THREAD.slice(0, 6)]

type MessagesQuery = { limit?: number; before?: string }

function messageCalls(): MessagesQuery[] {
  return (mockedGet.mock.calls as unknown[][])
    .filter((call) => call[0] === '/clients/{id}/messages')
    .map((call) => (call[1] as { params: { query: MessagesQuery } }).params.query)
}

let queryClient: QueryClient

function renderConversation() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/clients/client-1/conversation']}>
        <Routes>
          <Route path="/clients/:id/conversation" element={<ClientConversationPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** The message bubbles and the divider, top to bottom, by their text. */
function shown(): string[] {
  return screen.getAllByText(/^message |^Became an applicant$/).map((el) => el.textContent ?? '')
}

beforeEach(() => {
  newestPage = CASE_THREAD.slice(5)
  mockedGet.mockReset()
  mockedPost.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  // The socket is up, so nothing polls; the poll has its own test below.
  useRealtimeStore.setState({ status: 'open' })
  Element.prototype.scrollIntoView = vi.fn()
  mockedPost.mockResolvedValue({ data: undefined, error: undefined } as never)
  mockedGet.mockImplementation((async (path: string, init?: { params?: { query?: MessagesQuery } }) => {
    if (path === '/clients/{id}') {
      return {
        data: { id: 'client-1', status: 'in_plan', case_type: 'pr', student: { first_name: 'Asha', last_name: 'Nair' } },
        error: undefined,
      }
    }
    if (path === '/clients/{id}/messages') {
      const before = init?.params?.query?.before
      if (!before) return { data: { items: newestPage, meta: { next_cursor: 'cursor-older' } }, error: undefined }
      if (before === 'cursor-older') return { data: { items: OLDER_PAGE, meta: { next_cursor: null } }, error: undefined }
    }
    return { data: undefined, error: { error: { message: 'unexpected request' } } }
  }) as never)
})

afterEach(() => {
  vi.useRealTimers()
  useRealtimeStore.setState({ status: 'idle' })
})

describe('lead and client chat paging (F-029)', () => {
  it('loads the newest page first and offers the earlier ones', async () => {
    renderConversation()
    await screen.findByText('message c35')

    expect(messageCalls()).toEqual([{ limit: 30, before: undefined }])
    expect(shown()).toEqual(newestPage.map((m) => m.content))
    expect(screen.queryByText('message c5')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load earlier messages' })).toBeInTheDocument()
    expect(screen.queryByText('Start of conversation')).not.toBeInTheDocument()
  })

  it('"Load earlier" sends the cursor back and prepends, with no duplicate and no reordering', async () => {
    renderConversation()
    await screen.findByText('message c35')
    fireEvent.click(screen.getByRole('button', { name: 'Load earlier messages' }))
    await screen.findByText('message c1')

    expect(messageCalls()).toEqual([
      { limit: 30, before: undefined },
      { limit: 30, before: 'cursor-older' },
    ])
    // c6 came back on both pages and is shown once; everything reads oldest to newest.
    expect(shown()).toEqual([...LEAD_HISTORY, SESSION_BREAK, ...CASE_THREAD].map((m) => m.content))
    expect(screen.getByText('Start of conversation')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument()
  })

  it('shows the earlier lead conversation and the session break once paging reaches them', async () => {
    renderConversation()
    await screen.findByText('message c35')
    expect(screen.queryByText('Became an applicant')).not.toBeInTheDocument()
    expect(screen.queryByText('message l10')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Load earlier messages' }))
    await screen.findByText('Became an applicant')
    const order = shown()
    expect(order.indexOf('message l10')).toBe(order.indexOf('Became an applicant') - 1)
    expect(order.indexOf('message c1')).toBe(order.indexOf('Became an applicant') + 1)
  })

  it('a live message arriving while older pages are loaded appears once, at the bottom, with no refetch', async () => {
    renderConversation()
    await screen.findByText('message c35')
    fireEvent.click(screen.getByRole('button', { name: 'Load earlier messages' }))
    await screen.findByText('message c1')
    const requestsBefore = messageCalls().length

    const live = message('c36', 50)
    act(() => {
      applyChatMessage(queryClient, { type: 'client', id: 'client-1' }, live)
      // The same frame again (the sender's other connection, or a replay after a reconnect).
      applyChatMessage(queryClient, { type: 'client', id: 'client-1' }, live)
    })

    await screen.findByText('message c36')
    expect(screen.getAllByText('message c36')).toHaveLength(1)
    expect(shown().at(-1)).toBe('message c36')
    expect(shown()).toHaveLength(LEAD_HISTORY.length + 1 + CASE_THREAD.length + 1)
    expect(messageCalls()).toHaveLength(requestsBefore)
  })

  it('a sent message goes into the newest page from the answer, without refetching the loaded pages', async () => {
    renderConversation()
    await screen.findByText('message c35')
    fireEvent.click(screen.getByRole('button', { name: 'Load earlier messages' }))
    await screen.findByText('message c1')
    const requestsBefore = messageCalls().length

    mockedPost.mockResolvedValue({
      data: message('c36', 50, { sender: 'consultant', content: 'message sent' }),
      error: undefined,
    } as never)
    fireEvent.change(screen.getByPlaceholderText('Write a message…'), { target: { value: 'message sent' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(shown().at(-1)).toBe('message sent'))
    expect(messageCalls()).toHaveLength(requestsBefore)
  })

  it('with the socket down and older pages loaded, the poll asks for the newest page only', async () => {
    renderConversation()
    await screen.findByText('message c35')
    fireEvent.click(screen.getByRole('button', { name: 'Load earlier messages' }))
    await screen.findByText('message c1')
    mockedGet.mockClear()

    // The socket drops under a fake clock, so the poll's interval is the one being advanced.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    act(() => useRealtimeStore.setState({ status: 'reconnecting' }))
    newestPage = [...CASE_THREAD.slice(6), message('c36', 50)]
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    await screen.findByText('message c36')
    expect(messageCalls()).toEqual([{ limit: 30, before: undefined }])
    expect(shown().at(-1)).toBe('message c36')
    expect(shown()).toHaveLength(LEAD_HISTORY.length + 1 + CASE_THREAD.length + 1)
  })
})

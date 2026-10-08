import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The chat drawer after review F-086/F-115: the server lists only the conversations going on now,
// always paged; the search box asks the server and can find anyone; "Show closed" is the server's
// filter; a closed row opens read-only; the badge is the server's count. Pinned here against the
// requests the drawer actually sends.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useChatWindowStore } from '@/stores/chatWindowStore'
import { applyConversationUpdated } from '@/lib/realtime/queryCache'
import { GlobalChatDrawer } from './GlobalChatDrawer'

const mockedGet = vi.mocked(api.GET)

type Query = { cursor?: string; limit?: number; search?: string; 'filter[show_closed]'?: boolean }

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: 'lead',
    name: `Student ${id}`,
    last_message_at: '2026-10-07T09:00:00Z',
    last_message_preview: `Hello from ${id}`,
    unread: false,
    closed: false,
    ...overrides,
  }
}

function answer(items: unknown[], nextCursor: string | null = null, unread = 4) {
  return { data: { items, meta: { next_cursor: nextCursor, total: items.length, unread_count: unread } }, error: undefined }
}

/** Every request the drawer's LIST sent (the badge's own one-row read is left out). */
function listRequests(): Query[] {
  return (mockedGet.mock.calls as unknown[][])
    .map((call) => (call[1] as { params: { query: Query } }).params.query)
    .filter((query) => query.limit !== 1)
}

let client: QueryClient

function renderDrawer() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <GlobalChatDrawer />
    </QueryClientProvider>,
  )
}

async function openDrawer() {
  fireEvent.click(screen.getByRole('button', { name: 'Chats' }))
  await screen.findByRole('dialog', { name: 'Chats' })
}

beforeEach(() => {
  mockedGet.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  useChatWindowStore.setState({ conversation: null, minimized: false })
  mockedGet.mockImplementation((async (_path: unknown, opts: { params: { query: Query } }) => {
    const query = opts.params.query
    if (query.limit === 1) return answer([row('l1')], 'more')
    if (query.search === 'old') return answer([row('never', { last_message_at: null, last_message_preview: null }), row('gone', { closed: true })])
    if (query['filter[show_closed]']) return answer([row('l1'), row('gone', { closed: true })])
    if (query.cursor === 'page-2') return answer([row('l2'), row('l3')])
    return answer([row('l1'), row('l2')], 'page-2')
  }) as never)
})

describe('the chat drawer', () => {
  it('shows the server count on the badge, from a request that sends a limit', async () => {
    renderDrawer()
    expect(await screen.findByText('4')).toBeInTheDocument()
    expect(mockedGet).toHaveBeenCalledWith('/conversations', expect.objectContaining({ params: { query: { limit: 1 } } }))
  })

  it('loads nothing but the badge until it is opened, then a page with a limit', async () => {
    renderDrawer()
    await screen.findByText('4')
    expect(listRequests()).toHaveLength(0)

    await openDrawer()
    expect(await screen.findByText('Student l1')).toBeInTheDocument()
    expect(listRequests()[0]).toMatchObject({ limit: 20 })
    expect(listRequests()[0].cursor).toBeUndefined()
  })

  it('"Load more" walks next_cursor, and a row repeated across pages is shown once', async () => {
    renderDrawer()
    await openDrawer()
    await screen.findByText('Student l1')

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByText('Student l3')).toBeInTheDocument()
    expect(listRequests().at(-1)).toMatchObject({ cursor: 'page-2', limit: 20 })
    // l2 came back on both pages.
    expect(screen.getAllByText('Student l2')).toHaveLength(1)
    // The last page: nothing further to load.
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('asks the server for what is typed, and shows people never messaged and closed ones', async () => {
    renderDrawer()
    await openDrawer()
    await screen.findByText('Student l1')

    fireEvent.change(screen.getByLabelText('Search conversations'), { target: { value: 'old' } })

    expect(await screen.findByText('Student never')).toBeInTheDocument()
    expect(listRequests().at(-1)).toMatchObject({ search: 'old', limit: 20 })
    expect(screen.getByText('No messages yet')).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
    // The rows of the list before the search are gone: nothing is filtered in the browser.
    expect(screen.queryByText('Student l1')).not.toBeInTheDocument()
  })

  it('"Show closed" sends filter[show_closed]=true', async () => {
    renderDrawer()
    await openDrawer()
    await screen.findByText('Student l1')
    expect(listRequests().every((query) => query['filter[show_closed]'] === undefined)).toBe(true)

    fireEvent.click(screen.getByRole('switch', { name: 'Show closed' }))

    expect(await screen.findByText('Student gone')).toBeInTheDocument()
    expect(listRequests().at(-1)).toMatchObject({ 'filter[show_closed]': true, limit: 20 })
  })

  it('opens a closed row as closed, and an open or internal row as not closed', async () => {
    renderDrawer()
    await openDrawer()
    fireEvent.click(await screen.findByRole('switch', { name: 'Show closed' }))
    fireEvent.click(await screen.findByText('Student gone'))
    expect(useChatWindowStore.getState().conversation).toMatchObject({ id: 'gone', type: 'lead', closed: true })

    await openDrawer()
    fireEvent.click(await screen.findByText('Student l1'))
    expect(useChatWindowStore.getState().conversation).toMatchObject({ id: 'l1', closed: false })
  })

  it('a live message for a conversation on no loaded page reads the list again, and adds no second row', async () => {
    renderDrawer()
    await openDrawer()
    await screen.findByText('Student l1')
    const before = listRequests().length
    mockedGet.mockImplementation((async (_path: unknown, opts: { params: { query: Query } }) =>
      opts.params.query.limit === 1 ? answer([row('far')], 'more', 5) : answer([row('far'), row('l1'), row('l2')])) as never)

    applyConversationUpdated(client, row('far', { last_message_preview: 'New message', unread: true }) as never)

    expect(await screen.findByText('Student far')).toBeInTheDocument()
    expect(listRequests().length).toBeGreaterThan(before)
    expect(screen.getAllByText('Student l1')).toHaveLength(1)

    // And one already on screen is patched where it is, with no further request.
    const settled = listRequests().length
    applyConversationUpdated(client, row('l2', { last_message_preview: 'Patched in place' }) as never)
    expect(await screen.findByText('Patched in place')).toBeInTheDocument()
    await waitFor(() => expect(listRequests()).toHaveLength(settled))
    expect(screen.getAllByText('Student l2')).toHaveLength(1)
  })
})

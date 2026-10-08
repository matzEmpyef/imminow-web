import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-135: a case's activity sends its count with the FIRST page only; a page reached with a
// cursor carries `total: null`. The tab keeps the first page's figure while the person pages on.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ActivityTab } from './ClientProfileActivityTab'

const mockedGet = vi.mocked(api.GET)

function event(id: string) {
  return { id, description: `Event ${id}`, created_at: '2026-10-01T09:00:00Z' }
}

beforeEach(() => {
  mockedGet.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  mockedGet.mockImplementation((async (_path: unknown, opts: { params: { query: { cursor?: string } } }) =>
    opts.params.query.cursor
      ? { data: { items: [event('b1')], meta: { next_cursor: null, total: null } }, error: undefined }
      : { data: { items: [event('a1')], meta: { next_cursor: 'page-2', total: 41 } }, error: undefined }) as never)
})

describe("a client's Activity tab", () => {
  it('keeps the first page count on a later page, which carries none', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ActivityTab clientId="c1" />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Event a1')).toBeInTheDocument()
    expect(screen.getByText('41 events')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Event b1')).toBeInTheDocument()
    expect(screen.getByText('41 events')).toBeInTheDocument()
    expect(screen.queryByText(/null/)).not.toBeInTheDocument()
  })
})

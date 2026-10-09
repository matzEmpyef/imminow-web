import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-112: the feed keeps only tasks completed in the last 30 days. The Activity page links to
// the older ones: GET /activity-tasks with filter[completed_before] = now − 30 days, newest
// completed first, 20 to a page, "Assigned to me" being assigned_to_me=true.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { CompletedTasksSection } from './CompletedTasksSection'

const mockedGet = vi.mocked(api.GET)

type Query = { cursor?: string; limit?: number; assigned_to_me?: boolean; 'filter[completed_before]'?: string }

function task(id: string, completedAt: string | null = '2026-08-01T10:00:00Z') {
  return {
    id,
    note: `Chase documents ${id}`,
    status: 'done',
    due_date: '2026-07-30',
    created_at: '2026-07-20T10:00:00Z',
    completed_at: completedAt,
    client_name: null,
    lead_name: null,
    assigned_to: { user: { first_name: 'Asha', last_name: 'Nair' } },
    assigned_by: { user: { first_name: 'Ravi', last_name: 'Das' } },
  }
}

function answer(items: unknown[], nextCursor: string | null = null, total = items.length) {
  return { data: { items, meta: { next_cursor: nextCursor, total } }, error: undefined }
}

function requests(): Query[] {
  return (mockedGet.mock.calls as unknown[][]).map((call) => (call[1] as { params: { query: Query } }).params.query)
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CompletedTasksSection />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockedGet.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  mockedGet.mockImplementation((async (_path: unknown, opts: { params: { query: Query } }) => {
    const q = opts.params.query
    if (q.cursor === 'p2') return answer([task('t3', '2026-07-01T10:00:00Z')], null, 3)
    if (q.assigned_to_me) return answer([task('mine')])
    return answer([task('t1'), task('t2', '2026-07-15T10:00:00Z')], 'p2', 3)
  }) as never)
})

describe('Completed tasks older than 30 days', () => {
  it('asks for nothing until the link is used', () => {
    renderSection()
    expect(screen.getByRole('button', { name: 'Completed tasks older than 30 days' })).toBeInTheDocument()
    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('lists tasks completed before now − 30 days, 20 a page, each with its completed date', async () => {
    const before = Date.now()
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Completed tasks older than 30 days' }))

    expect(await screen.findByText('Chase documents t1')).toBeInTheDocument()
    expect(screen.getByText('Completed 01/08/2026')).toBeInTheDocument()
    expect(screen.getByText('Completed 15/07/2026')).toBeInTheDocument()
    expect(screen.getAllByText(/Asha Nair · assigned by Ravi Das/)).toHaveLength(2)

    const q = requests()[0]
    expect(q.limit).toBe(20)
    expect(q.assigned_to_me).toBeUndefined()
    const sent = new Date(q['filter[completed_before]']!).getTime()
    expect(Math.abs(sent - (before - 30 * 86_400_000))).toBeLessThan(60_000)
  })

  it('Assigned to me sends assigned_to_me=true, and All I can see takes it off again', async () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Completed tasks older than 30 days' }))
    await screen.findByText('Chase documents t1')

    fireEvent.click(screen.getByRole('radio', { name: /Assigned to me/ }))
    expect(await screen.findByText('Chase documents mine')).toBeInTheDocument()
    expect(requests().at(-1)).toMatchObject({ assigned_to_me: true, limit: 20 })

    fireEvent.click(screen.getByRole('radio', { name: /All I can see/ }))
    await screen.findByText('Chase documents t1')
    expect(requests().at(-1)!.assigned_to_me).toBeUndefined()
  })

  it('pages with the server’s cursor, and shows the total', async () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Completed tasks older than 30 days' }))
    await screen.findByText('Chase documents t1')
    expect(screen.getByText('3 completed tasks')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Chase documents t3')).toBeInTheDocument()
    expect(requests().at(-1)).toMatchObject({ cursor: 'p2', limit: 20 })
    // The cut-off does not move between pages.
    expect(requests().at(-1)!['filter[completed_before]']).toBe(requests()[0]['filter[completed_before]'])
  })

  it('says "Nothing older than 30 days." when there is nothing', async () => {
    mockedGet.mockResolvedValue(answer([]) as never)
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Completed tasks older than 30 days' }))
    expect(await screen.findByText('Nothing older than 30 days.')).toBeInTheDocument()
  })

  it('reads the transition answer (a bare array) as one page', async () => {
    mockedGet.mockResolvedValue({ data: [task('old')], error: undefined } as never)
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Completed tasks older than 30 days' }))
    expect(await screen.findByText('Chase documents old')).toBeInTheDocument()
  })

  it('shows a failure with a Retry', async () => {
    mockedGet.mockResolvedValueOnce({ data: undefined, error: { error: { code: 'x', message: 'nope' } } } as never)
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Completed tasks older than 30 days' }))
    expect(await screen.findByText('Could not load completed tasks.')).toBeInTheDocument()
    mockedGet.mockResolvedValue(answer([task('again')]) as never)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByText('Chase documents again')).toBeInTheDocument())
  })
})

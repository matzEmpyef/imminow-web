import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Internal Notes tab (contract gate 7, reordered 2026-09-26 by the coordinator to page notes
// newest first): the panel must still show the notes chronologically — oldest at top — with a
// "Show earlier notes" button at the TOP loading older pages, hidden once there are none, the way
// a chat thread reads. `useInternalNotes`/`useAddInternalNote` are mocked here — their own
// ordering and cache-surgery contract is pinned in `queries/clients.notes.test.tsx`.
vi.mock('@/queries/clients', () => ({ useInternalNotes: vi.fn(), useAddInternalNote: vi.fn() }))

import { useAddInternalNote, useInternalNotes } from '@/queries/clients'
import { InternalNotesTab } from './ClientProfileInternalNotesTab'

const mockedNotes = vi.mocked(useInternalNotes)
const mockedAddNote = vi.mocked(useAddInternalNote)

function note(id: string, content: string, created_at: string) {
  return { id, content, created_at, author: { first_name: 'Priya', last_name: 'Rao' } }
}

function notesResult(pages: { items: ReturnType<typeof note>[]; meta: { next_cursor: string | null; total: number } }[], overrides: Record<string, unknown> = {}) {
  return {
    data: { pages, pageParams: pages.map(() => undefined) },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    hasNextPage: pages.at(-1)?.meta.next_cursor != null,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    ...overrides,
  } as never
}

beforeEach(() => {
  mockedNotes.mockReset()
  mockedAddNote.mockReset()
  mockedAddNote.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
})

describe('InternalNotesTab', () => {
  it('renders notes chronologically (oldest at top) even though the page arrived newest-first', () => {
    // Server order within the one loaded page is newest-first, per the contract.
    mockedNotes.mockReturnValue(
      notesResult([
        {
          items: [
            note('n3', 'third, newest', '2026-09-26T12:00:00Z'),
            note('n2', 'second', '2026-09-26T11:00:00Z'),
            note('n1', 'first, oldest', '2026-09-26T10:00:00Z'),
          ],
          meta: { next_cursor: null, total: 3 },
        },
      ]),
    )
    render(<InternalNotesTab clientId="client-1" />)

    const rendered = screen.getAllByText(/first, oldest|second$|third, newest/).map((el) => el.textContent)
    expect(rendered).toEqual(['first, oldest', 'second', 'third, newest'])
  })

  it('shows "Show earlier notes" only when a next page exists, and it loads older notes on click', async () => {
    const fetchNextPage = vi.fn()
    mockedNotes.mockReturnValue(
      notesResult(
        [{ items: [note('n2', 'newest page', '2026-09-26T12:00:00Z')], meta: { next_cursor: 'older', total: 2 } }],
        { fetchNextPage },
      ),
    )
    render(<InternalNotesTab clientId="client-1" />)

    const button = screen.getByRole('button', { name: /show earlier notes/i })
    fireEvent.click(button)
    expect(fetchNextPage).toHaveBeenCalledTimes(1)
  })

  it('hides "Show earlier notes" once there are no more pages', () => {
    mockedNotes.mockReturnValue(
      notesResult([{ items: [note('n1', 'only note', '2026-09-26T12:00:00Z')], meta: { next_cursor: null, total: 1 } }]),
    )
    render(<InternalNotesTab clientId="client-1" />)
    expect(screen.queryByRole('button', { name: /show earlier notes/i })).not.toBeInTheDocument()
  })

  it('a note added a moment ago (now the top of pages[0]) renders at the bottom of the list', () => {
    // Simulates the state right after useAddInternalNote's cache surgery: the new note is now
    // items[0] of pages[0] (the mutation itself is pinned in clients.notes.test.tsx) — this only
    // checks the tab still puts it last visually, i.e. chronologicalPages reversed it correctly.
    mockedNotes.mockReturnValue(
      notesResult([
        {
          items: [
            note('n2', 'brand new note', '2026-09-26T13:00:00Z'),
            note('n1', 'older note', '2026-09-26T10:00:00Z'),
          ],
          meta: { next_cursor: null, total: 2 },
        },
      ]),
    )
    render(<InternalNotesTab clientId="client-1" />)
    const rendered = screen.getAllByText(/older note|brand new note/).map((el) => el.textContent)
    expect(rendered).toEqual(['older note', 'brand new note'])
  })
})

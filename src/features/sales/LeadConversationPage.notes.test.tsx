import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Lead Conversation's Notes card (contract gate 7, reordered 2026-09-26 by the coordinator to
// page notes newest first): same chronological-render + "Show earlier notes" contract as Client
// Profile's Internal Notes tab (ClientProfileInternalNotesTab.test.tsx) — exported here only so
// this one card can be pinned without mounting the whole conversation page (lead, messages,
// branches, chat panel, …).
vi.mock('@/queries/leads', () => ({ useLeadNotes: vi.fn(), useAddLeadNote: vi.fn() }))

import { useAddLeadNote, useLeadNotes } from '@/queries/leads'
import { NotesCard } from './LeadConversationPage'

const mockedNotes = vi.mocked(useLeadNotes)
const mockedAddNote = vi.mocked(useAddLeadNote)

function note(id: string, content: string, created_at: string) {
  return { id, content, created_at, author: { first_name: 'Priya', last_name: 'Rao' } }
}

function notesResult(pages: { items: ReturnType<typeof note>[]; meta: { next_cursor: string | null; total: number } }[], overrides: Record<string, unknown> = {}) {
  return {
    data: { pages, pageParams: pages.map(() => undefined) },
    isLoading: false,
    isError: false,
    hasNextPage: pages.at(-1)?.meta.next_cursor != null,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    ...overrides,
  } as never
}

beforeEach(() => {
  mockedNotes.mockReset()
  mockedAddNote.mockReset()
  mockedAddNote.mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
})

describe('NotesCard', () => {
  it('renders notes chronologically (oldest at top)', () => {
    mockedNotes.mockReturnValue(
      notesResult([
        {
          items: [note('n2', 'newer', '2026-09-26T12:00:00Z'), note('n1', 'older', '2026-09-26T10:00:00Z')],
          meta: { next_cursor: null, total: 2 },
        },
      ]),
    )
    render(<NotesCard leadId="lead-1" />)
    const rendered = screen.getAllByText(/^older$|^newer$/).map((el) => el.textContent)
    expect(rendered).toEqual(['older', 'newer'])
  })

  it('shows "Show earlier notes" when there is a next page and loads it on click', () => {
    const fetchNextPage = vi.fn()
    mockedNotes.mockReturnValue(
      notesResult([{ items: [note('n1', 'newest page', '2026-09-26T12:00:00Z')], meta: { next_cursor: 'older', total: 5 } }], {
        fetchNextPage,
      }),
    )
    render(<NotesCard leadId="lead-1" />)
    fireEvent.click(screen.getByRole('button', { name: /show earlier notes/i }))
    expect(fetchNextPage).toHaveBeenCalledTimes(1)
  })

  it('hides "Show earlier notes" once there are no more pages', () => {
    mockedNotes.mockReturnValue(
      notesResult([{ items: [note('n1', 'only note', '2026-09-26T12:00:00Z')], meta: { next_cursor: null, total: 1 } }]),
    )
    render(<NotesCard leadId="lead-1" />)
    expect(screen.queryByRole('button', { name: /show earlier notes/i })).not.toBeInTheDocument()
  })
})

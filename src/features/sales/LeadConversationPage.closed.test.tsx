import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A closed lead's conversation is read-only on the full page too (owner ruling 2026-10-06, review
// F-086/F-115; the chat drawer and floating window already were). No composer, no Suggest a
// course, none of the header actions that write into the thread; one line says why. The server's
// 409 `lead_closed` on a send turns the page read-only at once, and Reopen brings the composer
// back without a reload.
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/queries/leads', () => ({
  useLead: vi.fn(),
  useLeadMessages: vi.fn(),
  useSendLeadMessage: vi.fn(),
  useRequestShortlist: vi.fn(),
  useLeadNotes: vi.fn(),
  useAddLeadNote: vi.fn(),
  useSetLeadBranch: vi.fn(),
}))
vi.mock('@/queries/staff', () => ({ useBranches: () => ({ data: [] }) }))
vi.mock('@/stores/chatWindowStore', () => ({ useChatWindowStore: () => vi.fn() }))
vi.mock('@/lib/useMarkThreadRead', () => ({ useMarkThreadRead: vi.fn(), newestIncomingId: () => null }))
vi.mock('@/lib/realtime', () => ({ useViewingThread: vi.fn() }))
vi.mock('@/lib/features', () => ({ useFeature: () => true }))
vi.mock('@/lib/permissions', () => ({ usePermission: () => true }))
vi.mock('@/lib/convertRules', () => ({ useCanConvertLead: () => true }))
vi.mock('@/features/clients/SuggestCourseInChat', () => ({
  SuggestCourseInChat: () => <button type="button">Suggest a course</button>,
}))

import { ApiError } from '@/api/errors'
import {
  useAddLeadNote,
  useLead,
  useLeadMessages,
  useLeadNotes,
  useRequestShortlist,
  useSendLeadMessage,
  useSetLeadBranch,
} from '@/queries/leads'
import { LeadConversationPage } from './LeadConversationPage'

const CLOSED_NOTE = 'This conversation is closed and read-only.'
const send = vi.fn()

function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    name: 'Asha Nair',
    status: 'active',
    origin: 'imported',
    assigned_employee_id: 'e1',
    can_reopen: false,
    tags: [],
    created_at: '2026-09-01T10:00:00Z',
    ...overrides,
  }
}

function serveLead(data: ReturnType<typeof lead>) {
  vi.mocked(useLead).mockReturnValue({ data, isLoading: false, isError: false, refetch: vi.fn() } as never)
}

function page() {
  return (
    <MemoryRouter initialEntries={['/sales/leads/l1']}>
      <Routes>
        <Route path="/sales/leads/:id" element={<LeadConversationPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  send.mockReset()
  vi.mocked(useLeadMessages).mockReturnValue({
    items: [{ id: 'm1', sender: 'student', content: 'Thank you for the help', created_at: '2026-09-01T10:00:00Z' }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    hasEarlier: false,
    loadingEarlier: false,
    loadEarlier: vi.fn(),
  } as never)
  vi.mocked(useLeadNotes).mockReturnValue({ data: { pages: [] }, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() } as never)
  const idle = { mutate: vi.fn(), isPending: false, isError: false }
  vi.mocked(useSendLeadMessage).mockReturnValue({ ...idle, mutate: send } as never)
  for (const hook of [useRequestShortlist, useAddLeadNote, useSetLeadBranch]) vi.mocked(hook).mockReturnValue(idle as never)
  // jsdom has no layout engine: ChatPanel scrolls to the latest message on mount.
  Element.prototype.scrollIntoView = vi.fn()
})

describe('the Lead conversation page', () => {
  it('keeps the composer and the thread actions on an open lead', () => {
    serveLead(lead())
    render(page())
    expect(screen.getByPlaceholderText('Write a message…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suggest a course' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request Shortlist' })).toBeInTheDocument()
    expect(screen.queryByText(CLOSED_NOTE)).not.toBeInTheDocument()
  })

  it('shows a closed lead’s thread with one line in place of the composer and no action that writes into it', () => {
    serveLead(lead({ status: 'closed', can_reopen: true }))
    render(page())

    expect(screen.getByText('Thank you for the help')).toBeInTheDocument()
    expect(screen.getByText(CLOSED_NOTE)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Write a message…')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suggest a course' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request Shortlist' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Convert to Client' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reopen Lead' })).toBeInTheDocument()
  })

  it('says only that an empty closed thread has no messages, never "say hello"', () => {
    vi.mocked(useLeadMessages).mockReturnValue({
      items: [], isLoading: false, isError: false, refetch: vi.fn(), hasEarlier: false, loadingEarlier: false, loadEarlier: vi.fn(),
    } as never)
    serveLead(lead({ status: 'closed' }))
    const view = render(page())
    expect(screen.getByText('No messages in this conversation.')).toBeInTheDocument()
    expect(screen.queryByText(/say hello/)).not.toBeInTheDocument()
    expect(screen.getByText(CLOSED_NOTE)).toBeInTheDocument()
    view.unmount()

    serveLead(lead())
    render(page())
    expect(screen.getByText('No messages yet — say hello.')).toBeInTheDocument()
  })

  it('says closed before "allocate this lead" on a closed lead nobody holds', () => {
    serveLead(lead({ status: 'closed', assigned_employee_id: null }))
    render(page())
    expect(screen.getByText(CLOSED_NOTE)).toBeInTheDocument()
    expect(screen.queryByText(/Allocate this lead/)).not.toBeInTheDocument()
  })

  it('turns read-only on the server’s 409 lead_closed, in its words, and gets the composer back after Reopen', () => {
    const sentence = 'This conversation is closed, so no new messages can be sent.'
    send.mockImplementation((_content: string, options: { onError: (error: unknown) => void }) =>
      options.onError(new ApiError('Could not send this message.', { error: { code: 'lead_closed', message: sentence } }, 409)),
    )
    serveLead(lead())
    const view = render(page())

    fireEvent.change(screen.getByPlaceholderText('Write a message…'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(screen.getByText(sentence)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Write a message…')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suggest a course' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request Shortlist' })).not.toBeInTheDocument()

    // The lead is read again (it is closed), then reopened: the same mounted page, no reload.
    serveLead(lead({ status: 'closed', can_reopen: true }))
    view.rerender(page())
    expect(screen.queryByPlaceholderText('Write a message…')).not.toBeInTheDocument()
    serveLead(lead())
    view.rerender(page())
    expect(screen.getByPlaceholderText('Write a message…')).toBeInTheDocument()
    expect(screen.queryByText(sentence)).not.toBeInTheDocument()
  })

  it('shows any other failed send above the composer and stays open', () => {
    send.mockImplementation((_content: string, options: { onError: (error: unknown) => void }) =>
      options.onError(new ApiError('Could not send this message.', { error: { code: 'http_500', message: '' } }, 500)),
    )
    serveLead(lead())
    render(page())
    fireEvent.change(screen.getByPlaceholderText('Write a message…'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not send this message.')
    expect(screen.getByPlaceholderText('Write a message…')).toBeInTheDocument()
  })

  it('says why a lead closed, in the server’s own sentence, ahead of the read-only note', () => {
    serveLead(lead({ status: 'closed', closed_by: 'student', closed_reason_label: 'The student ended this chat.' }))
    render(page())
    expect(screen.getByText(`The student ended this chat. ${CLOSED_NOTE}`)).toBeInTheDocument()
  })

  it('hides Reopen on a chat the student ended, even when the lead still says it can be reopened', () => {
    serveLead(
      lead({ status: 'closed', can_reopen: true, closed_by: 'student', closed_reason_label: 'The student ended this chat.' }),
    )
    render(page())
    expect(screen.queryByRole('button', { name: 'Reopen Lead' })).not.toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('still offers Reopen on a lead the consultancy closed itself', () => {
    serveLead(lead({ status: 'closed', can_reopen: true, closed_by: 'consultancy', closed_reason_label: 'Lost contact' }))
    render(page())
    expect(screen.getByText(`Lost contact ${CLOSED_NOTE}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reopen Lead' })).toBeInTheDocument()
  })
})

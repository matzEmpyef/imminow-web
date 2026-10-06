import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Lane x, item 4 (review F-029). The chat header's shortlist button and the "Suggested" marks come
// from the lead itself (`lead.shortlist`, `lead.suggested_course_ids`), which the server works out
// from the whole thread. They used to be read off whatever messages were loaded, so a long chat
// offered "Request Shortlist" again, and a course suggested long ago could be suggested twice.
// Pinned here: the three header states, that no message is consulted, and that the lead is read
// again after the console's own suggestion.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { SuggestCourseInChat } from '@/features/clients/SuggestCourseInChat'
import type { components } from '@/api/schema'
import { ShortlistAction } from './LeadConversationPage'

type Lead = components['schemas']['Lead']
type Shortlist = components['schemas']['LeadShortlist']

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

const COURSE = {
  id: 'course-1',
  name: 'MSc Data Science',
  college_id: 'col-1',
  college_name: 'Northfield University',
  country: 'Canada',
  campuses: [],
}

function shortlist(overrides: Partial<Shortlist> = {}): Shortlist {
  return { status: 'none', requested_at: null, shared_at: null, courses: [], ...overrides }
}

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    name: 'Ravi Menon',
    status: 'active',
    origin: 'sentpo',
    assigned_employee_id: 'e1',
    created_at: '2026-10-01T09:00:00Z',
    shortlist: shortlist(),
    suggested_course_ids: [],
    ...overrides,
  } as Lead
}

/** What `GET /leads/{id}` answers; tests change it to stand for the server moving on. */
let served: Lead

function getsTo(path: string) {
  return (mockedGet.mock.calls as unknown[][]).filter((call) => call[0] === path).length
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  served = lead()
  mockedGet.mockImplementation((async (path: string) => {
    if (path === '/leads/{id}') return { data: served, error: undefined }
    if (path === '/courses') {
      return {
        data: { items: [COURSE, { ...COURSE, id: 'course-2', name: 'MSc Data Analytics' }], meta: { next_cursor: null } },
        error: undefined,
      }
    }
    return { data: { items: [], meta: { next_cursor: null } }, error: undefined }
  }) as never)
  mockedPost.mockResolvedValue({ data: { id: 'm9', type: 'shortlist_request' }, error: undefined } as never)
})

describe('the chat header shortlist button follows lead.shortlist', () => {
  it('nothing asked or shared: "Request Shortlist" sends the request', async () => {
    render(<ShortlistAction lead={lead()} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Request Shortlist' }))
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1))
    expect(mockedPost.mock.calls[0][0]).toBe('/leads/{id}/request-shortlist')
    expect(mockedPost.mock.calls[0][1]).toEqual({ params: { path: { id: 'lead-1' } } })
  })

  it('asked and not yet shared: a disabled "Shortlist Requested"', () => {
    render(
      <ShortlistAction lead={lead({ shortlist: shortlist({ status: 'requested', requested_at: '2026-10-05T09:00:00Z' }) })} />,
      { wrapper },
    )
    expect(screen.getByRole('button', { name: 'Shortlist Requested' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Request Shortlist' })).not.toBeInTheDocument()
  })

  it('asked again after a share still waits, though earlier courses exist', () => {
    render(<ShortlistAction lead={lead({ shortlist: shortlist({ status: 'requested', courses: [COURSE as never] }) })} />, {
      wrapper,
    })
    expect(screen.getByRole('button', { name: 'Shortlist Requested' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'View Shortlist' })).not.toBeInTheDocument()
  })

  it('shared: "View Shortlist" opens the courses the server sent', () => {
    render(
      <ShortlistAction
        lead={lead({ shortlist: shortlist({ status: 'shared', shared_at: '2026-10-06T09:00:00Z', courses: [COURSE as never] }) })}
      />,
      { wrapper },
    )
    fireEvent.click(screen.getByRole('button', { name: 'View Shortlist' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Shortlisted Courses')).toBeInTheDocument()
    expect(within(dialog).getByText('MSc Data Science')).toBeInTheDocument()
    expect(within(dialog).getByText(/Northfield University · Canada/)).toBeInTheDocument()
  })

  it('a lead still in the pool cannot be asked', () => {
    render(<ShortlistAction lead={lead({ assigned_employee_id: undefined })} />, { wrapper })
    const button = screen.getByRole('button', { name: 'Request Shortlist' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Allocate this lead first')
  })

  it('a lead without the field (an older answer) reads as nothing asked', () => {
    render(<ShortlistAction lead={lead({ shortlist: undefined })} />, { wrapper })
    expect(screen.getByRole('button', { name: 'Request Shortlist' })).toBeEnabled()
  })

  it('never reads the thread to decide', () => {
    render(<ShortlistAction lead={lead({ shortlist: shortlist({ status: 'shared', courses: [COURSE as never] }) })} />, {
      wrapper,
    })
    expect(getsTo('/leads/{id}/messages')).toBe(0)
  })
})

describe('"Suggest a course" marks what was already suggested from lead.suggested_course_ids', () => {
  const person = { id: 'lead-1', kind: 'lead' as const, firstName: 'Ravi', hasApp: false }

  async function openAndSearch() {
    render(<SuggestCourseInChat person={person} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a course' }))
    fireEvent.change(screen.getByLabelText('Course, college or field'), { target: { value: 'MSc' } })
    return (await screen.findByText('MSc Data Science')).closest('li')!
  }

  it('a course on the list reads "Suggested", with no thread message behind it', async () => {
    served = lead({ suggested_course_ids: ['course-1'] })
    const row = await openAndSearch()
    await waitFor(() => expect(within(row).getByText('Suggested')).toBeInTheDocument())
    expect(within(row).queryByRole('button', { name: 'Suggest' })).not.toBeInTheDocument()
    // The other course is still on offer.
    const other = screen.getByText('MSc Data Analytics').closest('li')!
    expect(within(other).getByRole('button', { name: 'Suggest' })).toBeInTheDocument()
  })

  it('suggesting a course reads the lead again, so the mark follows', async () => {
    const row = await openAndSearch()
    await waitFor(() => expect(getsTo('/leads/{id}')).toBeGreaterThan(0))
    const before = getsTo('/leads/{id}')
    served = lead({ suggested_course_ids: ['course-1'] })
    mockedPost.mockResolvedValue({ data: { id: 'm10', type: 'course_share' }, error: undefined } as never)

    fireEvent.click(within(row).getByRole('button', { name: 'Suggest' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }))

    await waitFor(() => expect(mockedPost).toHaveBeenCalled())
    expect(mockedPost.mock.calls[0][0]).toBe('/leads/{id}/suggest-course')
    await waitFor(() => expect(getsTo('/leads/{id}')).toBeGreaterThan(before))
  })
})

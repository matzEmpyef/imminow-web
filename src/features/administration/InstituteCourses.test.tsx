import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner decision 18 (lane y): a college's own institute account switches its own courses off and
// on. Pinned here: the page lists the college's courses (switched-off ones included) with one
// switch a row; what the switch may do is read off the row (`active` + `hidden_by`); each switch
// is confirmed in the exact words agreed; the row is replaced with the course the server returns;
// and every refusal shows the server's own sentence. Also the platform's "Hidden by" cell.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))

import { api } from '@/api/client'
import { formatDate } from '@/lib/time'
import { showToast } from '@/lib/toast'
import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, staffMe } from '@/test/me'
import { HiddenByCell } from '@/features/super-admin/CollegeDetailPage'
import type { Course } from '@/queries/courseSuggestions'
import { courseSwitchState } from '@/lib/courseSwitch'
import { InstituteCoursesPage } from './InstituteCoursesPage'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

const SWITCH_OFF_TEXT =
  'Switch off MSc Data Science? Students will no longer find it or be able to save or apply for it. Students who saved it will see it as no longer available and be notified. Applications already made are not affected. immiNow is told of this change.'
const SWITCH_ON_TEXT =
  'Switch BSc Nursing back on? Students will be able to find it again. immiNow is told of this change.'

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: 'c-on',
    name: 'MSc Data Science',
    college_id: 'col-1',
    college_name: 'Northfield University',
    level: 'masters',
    field_of_study: 'Computer Science',
    active: true,
    visible: true,
    hidden_by: null,
    hidden_at: null,
    campuses: [],
    ...overrides,
  } as Course
}

const ON = course()
const OFF_BY_COLLEGE = course({ id: 'c-own', name: 'BSc Nursing', active: false, visible: false, hidden_by: 'institute', hidden_at: '2026-10-05T09:00:00Z' })
const OFF_BY_PLATFORM = course({ id: 'c-plat', name: 'MBA', active: false, visible: false, hidden_by: 'platform', hidden_at: '2026-10-01T09:00:00Z' })
const DRAFT = course({ id: 'c-draft', name: 'PhD Physics', active: false, visible: false, hidden_by: null })

let served: Course[]

type Query = { search?: string; filter?: Record<string, string>; sort?: string }
function listCalls(): Query[] {
  return (mockedGet.mock.calls as unknown[][])
    .filter((call) => call[0] === '/courses')
    .map((call) => (call[1] as { params: { query: Query } }).params.query)
}

function refused(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return { data: undefined, error: { error: { code, message, details } }, response: { status } } as never
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <InstituteCoursesPage />
    </QueryClientProvider>,
  )
}

const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr')!
const switchIn = (row: HTMLElement) => within(row).getByRole('switch')

function signInAsInstitute(staff: Parameters<typeof staffMe>[0] = {}) {
  vi.mocked(useMe).mockReturnValue(
    meAnswered(
      staffMe({
        consultancy_kind: 'institute',
        college_id: 'col-1',
        permissions: ['settings.manage_course_suggestions'],
        ...staff,
      }),
    ),
  )
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  vi.mocked(showToast).mockClear()
  useAuthStore.setState({ accessToken: 'test-token' })
  signInAsInstitute()
  served = [ON, OFF_BY_COLLEGE, OFF_BY_PLATFORM, DRAFT]
  mockedGet.mockImplementation((async (path: string) => {
    if (path === '/courses') return { data: { items: served, meta: { next_cursor: null, total: served.length } }, error: undefined }
    return { data: [], error: undefined }
  }) as never)
})

describe('what a course switch may do, from the row', () => {
  it.each([
    [{ active: true, hidden_by: null }, 'on'],
    [{ active: false, hidden_by: 'institute' }, 'off_by_college'],
    [{ active: false, hidden_by: 'platform' }, 'off_by_platform'],
    [{ active: false, hidden_by: null }, 'not_published'],
    [{ active: false }, 'not_published'],
  ] as const)('%o is %s', (row, state) => {
    expect(courseSwitchState(row as never)).toBe(state)
  })
})

describe("a college's own course list", () => {
  it('lists every course, the switched-off ones too, and says where each stands', async () => {
    renderPage()
    const on = await rowOf('MSc Data Science')
    expect(within(on).getByText('On')).toBeInTheDocument()
    expect(switchIn(on)).toBeChecked()
    expect(switchIn(on)).toBeEnabled()

    const own = await rowOf('BSc Nursing')
    expect(within(own).getByText('Switched off by your college')).toBeInTheDocument()
    expect(within(own).getByText(`Since ${formatDate('2026-10-05T09:00:00Z')}`)).toBeInTheDocument()
    expect(switchIn(own)).not.toBeChecked()
    expect(switchIn(own)).toBeEnabled()

    // The server decides the scope: nothing is asked for by college, and nothing is filtered out.
    expect(listCalls()[0].filter).toBeUndefined()
  })

  it('locks the switch on a course immiNow switched off, and says so', async () => {
    renderPage()
    const row = await rowOf('MBA')
    expect(within(row).getByText('Switched off by immiNow')).toBeInTheDocument()
    expect(switchIn(row)).toBeDisabled()
    expect(switchIn(row)).not.toBeChecked()
    fireEvent.click(switchIn(row))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('locks the switch on a course that was never published, and says so', async () => {
    renderPage()
    const row = await rowOf('PhD Physics')
    expect(within(row).getByText('Not published yet')).toBeInTheDocument()
    expect(switchIn(row)).toBeDisabled()
  })

  it('filters by status through the server', async () => {
    renderPage()
    await rowOf('MSc Data Science')
    const status = screen.getByRole('combobox', { name: 'Status' })
    fireEvent.change(status, { target: { value: 'off_by_college' } })
    await waitFor(() => expect(listCalls().at(-1)?.filter).toEqual({ hidden_by: 'institute' }))
    fireEvent.change(status, { target: { value: 'off_by_platform' } })
    await waitFor(() => expect(listCalls().at(-1)?.filter).toEqual({ hidden_by: 'platform' }))
    fireEvent.change(status, { target: { value: 'off' } })
    await waitFor(() => expect(listCalls().at(-1)?.filter).toEqual({ active: 'false' }))
    fireEvent.change(status, { target: { value: 'on' } })
    await waitFor(() => expect(listCalls().at(-1)?.filter).toEqual({ active: 'true' }))
  })

  it('an institute not linked to a college yet is told so, with no empty table', async () => {
    signInAsInstitute({ college_id: null })
    renderPage()
    expect(await screen.findByText('Your account is not linked to a college yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('a consultancy that reaches the page is told it is for college accounts', () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(staffMe({ permissions: ['settings.manage_course_suggestions'] })))
    renderPage()
    expect(screen.getByText('This page is for college accounts.')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})

describe('switching a course off', () => {
  it('asks first, in the agreed words, and Cancel sends nothing', async () => {
    renderPage()
    fireEvent.click(switchIn(await rowOf('MSc Data Science')))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(SWITCH_OFF_TEXT)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('sends active false and replaces the row with the course the server returns, without a reload', async () => {
    mockedPost.mockResolvedValue({
      data: { ...ON, active: false, visible: false, hidden_by: 'institute', hidden_at: '2026-10-07T09:00:00Z' },
      error: undefined,
      response: { status: 200 },
    } as never)
    renderPage()
    const row = await rowOf('MSc Data Science')
    const listsBefore = listCalls().length
    fireEvent.click(switchIn(row))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Switch off' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockedPost.mock.calls[0][0]).toBe('/courses/{id}/switch')
    expect(mockedPost.mock.calls[0][1]).toEqual({ params: { path: { id: 'c-on' } }, body: { active: false } })
    expect(showToast).toHaveBeenCalledWith('MSc Data Science switched off')

    const after = await rowOf('MSc Data Science')
    await waitFor(() => expect(within(after).getByText('Switched off by your college')).toBeInTheDocument())
    expect(switchIn(after)).not.toBeChecked()
    expect(switchIn(after)).toBeEnabled()
    expect(listCalls().length).toBe(listsBefore)
  })
})

describe('switching a course back on', () => {
  async function openConfirm() {
    renderPage()
    fireEvent.click(switchIn(await rowOf('BSc Nursing')))
    return screen.getByRole('dialog')
  }

  it('asks first, in the agreed words, then sends active true', async () => {
    mockedPost.mockResolvedValue({
      data: { ...OFF_BY_COLLEGE, active: true, visible: true, hidden_by: null, hidden_at: null },
      error: undefined,
      response: { status: 200 },
    } as never)
    const dialog = await openConfirm()
    expect(dialog).toHaveTextContent(SWITCH_ON_TEXT)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch on' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockedPost.mock.calls[0][1]).toEqual({ params: { path: { id: 'c-own' } }, body: { active: true } })
    expect(showToast).toHaveBeenCalledWith('BSc Nursing switched back on')
    const row = await rowOf('BSc Nursing')
    await waitFor(() => expect(within(row).getByText('On')).toBeInTheDocument())
    expect(switchIn(row)).toBeChecked()
  })

  it('409 hidden_by_platform: shows the server sentence, offers OK only, and reads the list again', async () => {
    mockedPost.mockResolvedValue(
      refused(409, 'hidden_by_platform', 'immiNow switched this course off, so only immiNow can switch it back on.'),
    )
    const dialog = await openConfirm()
    const before = listCalls().length
    // immiNow hid it in the meantime: the fresh list says so.
    served = [ON, { ...OFF_BY_COLLEGE, hidden_by: 'platform' } as Course, OFF_BY_PLATFORM, DRAFT]
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch on' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'immiNow switched this course off, so only immiNow can switch it back on.',
    )
    expect(within(dialog).queryByRole('button', { name: 'Switch on' })).not.toBeInTheDocument()
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(before))
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }))
    const row = await rowOf('BSc Nursing')
    await waitFor(() => expect(within(row).getByText('Switched off by immiNow')).toBeInTheDocument())
    expect(switchIn(row)).toBeDisabled()
  })

  it('409 course_incomplete: shows the server sentence', async () => {
    mockedPost.mockResolvedValue(
      refused(409, 'course_incomplete', 'This course cannot be switched on yet. It is missing: fee, entry requirements.', {
        missing: ['fee', 'requirements'],
      }),
    )
    const dialog = await openConfirm()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch on' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This course cannot be switched on yet. It is missing: fee, entry requirements.',
    )
    expect(within(dialog).getByRole('button', { name: 'OK' })).toBeInTheDocument()
  })

  it('409 course_incomplete with no sentence: names what is missing from details.missing', async () => {
    mockedPost.mockResolvedValue(refused(409, 'course_incomplete', '', { missing: ['deadline', 'campus'] }))
    const dialog = await openConfirm()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch on' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This course cannot be switched on yet. It is missing: application deadline, campus.',
    )
  })

  it('429: shows the server sentence and when to try again', async () => {
    mockedPost.mockResolvedValue(
      refused(429, 'rate_limited', 'Your college has switched courses too many times today. Try again later.', {
        retry_after_seconds: 7200,
      }),
    )
    const dialog = await openConfirm()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch on' }))
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('Your college has switched courses too many times today. Try again later.')
    expect(alert).toHaveTextContent('You can try again in about 2 hours.')
    expect(within(dialog).queryByRole('button', { name: 'Switch on' })).not.toBeInTheDocument()
  })

  it('404: closes, says the list was refreshed, and reads it again', async () => {
    mockedPost.mockResolvedValue(refused(404, 'not_found', 'Not found.'))
    const dialog = await openConfirm()
    const before = listCalls().length
    served = [ON, OFF_BY_PLATFORM, DRAFT]
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch on' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(showToast).toHaveBeenCalledWith('This course is no longer in your list. The list has been refreshed.', 'error')
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(before))
    await waitFor(() => expect(screen.queryByText('BSc Nursing')).not.toBeInTheDocument())
  })

  it('a failure with no answer can be tried again', async () => {
    mockedPost.mockResolvedValueOnce({ data: undefined, error: { error: {} }, response: { status: 502 } } as never)
    const dialog = await openConfirm()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch on' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not switch this course.')
    expect(within(dialog).getByRole('button', { name: 'Switch on' })).toBeEnabled()
  })
})

describe('the platform\'s "Hidden by" cell', () => {
  it('is blank for a course that is on', () => {
    const { container } = render(<HiddenByCell course={ON} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says "Draft" for a course that is off and was never published', () => {
    render(<HiddenByCell course={DRAFT} />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('says immiNow, who, and when', () => {
    render(<HiddenByCell course={{ ...OFF_BY_PLATFORM, hidden_by_name: 'Priya Rao' } as Course} />)
    expect(screen.getByText('immiNow')).toBeInTheDocument()
    expect(screen.getByText(`Priya Rao · ${formatDate('2026-10-01T09:00:00Z')}`)).toBeInTheDocument()
  })

  it('says College, and the date alone when the person is no longer known', () => {
    render(<HiddenByCell course={{ ...OFF_BY_COLLEGE, hidden_by_name: null } as Course} />)
    expect(screen.getByText('College')).toBeInTheDocument()
    expect(screen.getByText(formatDate('2026-10-05T09:00:00Z'))).toBeInTheDocument()
  })
})

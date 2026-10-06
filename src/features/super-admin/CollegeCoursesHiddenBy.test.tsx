import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner decision 18 (lane y), the platform side: Colleges & Courses → a college → its courses.
// Staff holding `catalog` are sent who switched each course off, and get a "Hidden by" column and
// filter. For platform staff without `catalog` the fields are absent, so the column and the
// filter are not shown at all: an absent value must never read as "Draft".
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))

import { api } from '@/api/client'
import { isAllowedDeepLink } from '@/lib/deepLinks'
import { formatDate } from '@/lib/time'
import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, platformMe } from '@/test/me'
import { CollegeDetailPage } from './CollegeDetailPage'

const mockedGet = vi.mocked(api.GET)

const COLLEGE = {
  id: 'col-1',
  name: 'Northfield University',
  active: true,
  visible: true,
  campuses: [],
  fields_of_study: [],
  partner_consultancies: [],
}

function course(overrides: Record<string, unknown>) {
  return {
    id: 'c1',
    name: 'MSc Data Science',
    college_id: 'col-1',
    college_name: 'Northfield University',
    active: true,
    visible: true,
    campuses: [],
    ...overrides,
  }
}

const WITH_FIELDS = [
  course({ id: 'c-on', name: 'MSc Data Science', hidden_by: null, hidden_at: null }),
  course({
    id: 'c-plat',
    name: 'MBA',
    active: false,
    hidden_by: 'platform',
    hidden_at: '2026-10-01T09:00:00Z',
    hidden_by_name: 'Priya Rao',
  }),
  course({
    id: 'c-inst',
    name: 'BSc Nursing',
    active: false,
    hidden_by: 'institute',
    hidden_at: '2026-10-05T09:00:00Z',
    hidden_by_name: 'Dev Shah',
  }),
  course({ id: 'c-draft', name: 'PhD Physics', active: false, hidden_by: null, hidden_at: null }),
]

let served: ReturnType<typeof course>[]

type Query = { filter?: Record<string, string> }
function courseListCalls(): Query[] {
  return (mockedGet.mock.calls as unknown[][])
    .filter((call) => call[0] === '/courses')
    .map((call) => (call[1] as { params: { query: Query } }).params.query)
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/colleges/col-1']}>
        <Routes>
          <Route path="/admin/colleges/:id" element={<CollegeDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const headers = () => screen.getAllByRole('columnheader').map((th) => th.textContent)
const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr')!

beforeEach(() => {
  mockedGet.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  served = WITH_FIELDS
  mockedGet.mockImplementation((async (path: string) => {
    if (path === '/colleges/{id}') return { data: COLLEGE, error: undefined }
    if (path === '/courses') return { data: { items: served, meta: { next_cursor: null, total: served.length } }, error: undefined }
    return { data: [], error: undefined }
  }) as never)
})

describe('Colleges & Courses, a college\'s courses: "Hidden by"', () => {
  it('staff holding catalog see who switched each course off, and when', async () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ catalog: true })))
    renderPage()

    const on = await rowOf('MSc Data Science')
    expect(headers()).toContain('Hidden by')
    // Blank for a course that is on.
    expect(within(on).queryByText('immiNow')).not.toBeInTheDocument()
    expect(within(on).queryByText('Draft')).not.toBeInTheDocument()

    const byPlatform = await rowOf('MBA')
    expect(within(byPlatform).getByText('immiNow')).toBeInTheDocument()
    expect(within(byPlatform).getByText(`Priya Rao · ${formatDate('2026-10-01T09:00:00Z')}`)).toBeInTheDocument()

    const byCollege = await rowOf('BSc Nursing')
    expect(within(byCollege).getByText('College')).toBeInTheDocument()
    expect(within(byCollege).getByText(`Dev Shah · ${formatDate('2026-10-05T09:00:00Z')}`)).toBeInTheDocument()

    expect(within(await rowOf('PhD Physics')).getByText('Draft')).toBeInTheDocument()
  })

  it('the filter asks the server for the courses one side switched off', async () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ catalog: true })))
    renderPage()
    await rowOf('MSc Data Science')
    const filter = screen.getByRole('combobox', { name: 'Hidden by' })
    fireEvent.change(filter, { target: { value: 'institute' } })
    await waitFor(() => expect(courseListCalls().at(-1)?.filter).toMatchObject({ college_id: 'col-1', hidden_by: 'institute' }))
    fireEvent.change(filter, { target: { value: 'platform' } })
    await waitFor(() => expect(courseListCalls().at(-1)?.filter).toMatchObject({ hidden_by: 'platform' }))
    fireEvent.change(filter, { target: { value: '' } })
    await waitFor(() => expect(courseListCalls().at(-1)?.filter).not.toHaveProperty('hidden_by'))
  })

  it('platform staff without catalog get no column and no filter, and nothing reads as "Draft"', async () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ support: true })))
    // The fields are absent for them.
    served = [
      course({ id: 'c-on', name: 'MSc Data Science' }),
      course({ id: 'c-off', name: 'MBA', active: false }),
    ]
    renderPage()
    await rowOf('MBA')
    expect(headers()).not.toContain('Hidden by')
    expect(screen.queryByRole('combobox', { name: 'Hidden by' })).not.toBeInTheDocument()
    expect(screen.queryByText('Draft')).not.toBeInTheDocument()
    expect(courseListCalls().every((q) => !q.filter?.hidden_by)).toBe(true)
  })
})

describe('the notice that a college switched a course', () => {
  it('opens that college\'s page', () => {
    expect(isAllowedDeepLink('/admin/colleges/col-1')).toBe(true)
    // The bare prefix is not a page of its own under this rule.
    expect(isAllowedDeepLink('/admin/colleges/')).toBe(false)
  })
})

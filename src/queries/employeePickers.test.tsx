import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Lane x, item 1 (review F-036): the roster is searched on the server. Every assign, transfer and
// recipient picker used to be handed "the first 100 employees", oldest first, leavers included, so
// in a large consultancy the newest staff could not be chosen anywhere. The fake server below
// holds 150 employees and answers `search`, `cursor`, `limit` and `filter[active]` the way
// `GET /staff/employees` does: number 140 is on nobody's first page.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/lib/features', () => ({ useFeature: () => true }))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: () => ({ isInstitute: false, person: 'consultant' }) }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useMe } from '@/queries/me'
import { meAnswered, staffMe } from '@/test/me'
import { ServerSearchSelect } from '@/components/ServerSearchSelect'
import { AssignConsultantMenu } from '@/features/sales/AssignConsultantMenu'
import { AssignTaskModal } from '@/features/dashboard/AssignTaskModal'
import { CreateDesignationModal } from '@/features/administration/CreateDesignationModal'
import { EmployeesPage } from '@/features/administration/EmployeesPage'
import { AllocationTab } from '@/features/administration/ConsultancyAllocationTab'
import { activeEmployeeSource, anyEmployeeSource } from './pickerSources'
import { useActiveEmployeeCount } from './staff'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

const pad = (n: number) => String(n).padStart(3, '0')

type Row = {
  id: string
  consultancy_id: string
  detail: 'full' | 'summary'
  active: boolean
  branch_ids: string[]
  designation_id?: string | null
  is_consultancy_admin?: boolean
  user: { id: string; first_name: string; last_name: string; role: string; designation: string | null; email: string | null; phone: string | null }
}

/** 150 employees, oldest first. Number 7 has left. */
let roster: Row[]

function employee(n: number, overrides: Partial<Row> = {}): Row {
  return {
    id: `emp-${n}`,
    consultancy_id: 'c1',
    detail: 'full',
    active: n !== 7,
    branch_ids: [],
    designation_id: 'd1',
    is_consultancy_admin: false,
    user: {
      id: `user-${n}`,
      first_name: 'Staff',
      last_name: pad(n),
      role: 'consultant',
      designation: 'Counsellor',
      email: `staff${n}@example.test`,
      phone: null,
    },
    ...overrides,
  }
}

type Query = { search?: string; cursor?: string; limit?: number; 'filter[active]'?: 'true' | 'false' | 'all' }

function rosterCalls(): Query[] {
  return (mockedGet.mock.calls as unknown[][])
    .filter((call) => call[0] === '/staff/employees')
    .map((call) => (call[1] as { params: { query: Query } }).params.query)
}

function byIdCalls(): string[] {
  return (mockedGet.mock.calls as unknown[][])
    .filter((call) => call[0] === '/staff/employees/{id}')
    .map((call) => (call[1] as { params: { path: { id: string } } }).params.path.id)
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const optionNames = () => screen.queryAllByRole('option').map((o) => o.textContent ?? '')

/** Opens the picker, checks the far colleague is not offered, then types the name and chooses. */
async function findAndChoose(input: HTMLElement, farName: string) {
  fireEvent.focus(input)
  await waitFor(() => expect(optionNames().some((n) => n.includes('Staff 001'))).toBe(true))
  expect(optionNames().some((n) => n.includes(farName))).toBe(false)
  fireEvent.change(input, { target: { value: farName } })
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(farName) }))
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(staffMe({ is_admin: true })))
  roster = Array.from({ length: 150 }, (_, i) => employee(i + 1))
  mockedGet.mockImplementation((async (
    path: string,
    init?: { params?: { query?: Query; path?: { id: string } } },
  ) => {
    if (path === '/staff/employees/{id}') {
      const row = roster.find((r) => r.id === init?.params?.path?.id)
      return row
        ? { data: row, error: undefined }
        : { data: undefined, error: { error: { code: 'not_found', message: 'Not found.' } } }
    }
    if (path !== '/staff/employees') return { data: [], error: undefined }
    const { search, cursor, limit = 20, 'filter[active]': active = 'true' } = init?.params?.query ?? {}
    const matching = roster
      .filter((r) => active === 'all' || r.active === (active === 'true'))
      .filter((r) => !search || `${r.user.first_name} ${r.user.last_name}`.toLowerCase().includes(search.toLowerCase()))
    const start = cursor ? Number(cursor) : 0
    const end = start + limit
    return {
      data: {
        items: matching.slice(start, end),
        meta: { next_cursor: end < matching.length ? String(end) : null, total: matching.length },
      },
      error: undefined,
    }
  }) as never)
  mockedPost.mockResolvedValue({ data: {}, error: undefined } as never)
})

describe('pickers over the roster search on the server (lane x)', () => {
  it('Allocate: a colleague past the first page is found by typing, and their name comes back', async () => {
    const onSelect = vi.fn()
    render(<AssignConsultantMenu onSelect={onSelect} label="Allocate Ravi" />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Allocate Ravi' }))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()

    await findAndChoose(screen.getByRole('combobox', { name: /Consultant/ }), 'Staff 140')
    expect(rosterCalls().at(-1)).toMatchObject({ search: 'Staff 140', 'filter[active]': 'true' })
    // Never "the first hundred": every request is one small page.
    expect(rosterCalls().every((q) => (q.limit ?? 0) <= 30)).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onSelect).toHaveBeenCalledWith('emp-140', 'Staff 140')
  })

  it('Allocate: someone who has left is not offered', async () => {
    render(<AssignConsultantMenu onSelect={vi.fn()} label="Allocate Ravi" />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Allocate Ravi' }))
    const input = screen.getByRole('combobox', { name: /Consultant/ })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Staff 007' } })
    expect(await screen.findByText('No one matches that name.')).toBeInTheDocument()
  })

  it('Reassign: the consultant who already holds the lead is left out', async () => {
    render(<AssignConsultantMenu onSelect={vi.fn()} excludeEmployeeId="emp-2" label="Reassign Ravi" />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Reassign Ravi' }))
    fireEvent.focus(screen.getByRole('combobox', { name: /Consultant/ }))
    await waitFor(() => expect(optionNames().some((n) => n.includes('Staff 001'))).toBe(true))
    expect(optionNames().some((n) => n.includes('Staff 002'))).toBe(false)
    expect(optionNames().some((n) => n.includes('Staff 003'))).toBe(true)
  })

  it('Assign Task: a colleague past the first page can be given the task', async () => {
    render(<AssignTaskModal onClose={vi.fn()} />, { wrapper })
    await findAndChoose(screen.getByRole('combobox', { name: /Assign to/ }), 'Staff 140')
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Call the student' } })
    fireEvent.change(screen.getByLabelText(/^Due date/), { target: { value: '2026-10-20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))

    await waitFor(() => expect(mockedPost).toHaveBeenCalled())
    expect(mockedPost.mock.calls[0][0]).toBe('/activity-tasks')
    expect((mockedPost.mock.calls[0][1] as { body: unknown }).body).toMatchObject({
      assigned_to: 'emp-140',
      note: 'Call the student',
      due_date: '2026-10-20',
    })
  })

  it('New Designation: access can be copied from a colleague past the first page, or from nobody', async () => {
    render(<CreateDesignationModal onClose={vi.fn()} />, { wrapper })
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Senior' } })
    await findAndChoose(screen.getByRole('combobox', { name: /Copy access from/ }), 'Staff 140')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(mockedPost).toHaveBeenCalled())
    expect((mockedPost.mock.calls[0][1] as { body: unknown }).body).toEqual({
      name: 'Senior',
      duplicate_from_employee_id: 'emp-140',
    })
  })

  it('a saved value that is not among the loaded results is read by id, and a summary row still names the person', async () => {
    roster[139] = employee(140, {
      detail: 'summary',
      designation_id: null,
      is_consultancy_admin: undefined,
      user: { id: 'user-140', first_name: 'Staff', last_name: '140', role: 'consultant', designation: 'Counsellor', email: null, phone: null },
    })
    render(<ServerSearchSelect source={activeEmployeeSource} value="emp-140" onChange={vi.fn()} ariaLabel="Consultant" />, {
      wrapper,
    })
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Consultant' }) as HTMLInputElement).value).toBe('Staff 140'))
    expect(byIdCalls()).toEqual(['emp-140'])
    // Nothing loaded the list to find one person.
    expect(rosterCalls()).toEqual([])
  })

  it('the audit log\'s "who" filter reaches people who have left, and marks them', async () => {
    const page = await anyEmployeeSource.fetchPage({ search: 'Staff 007', cursor: undefined, signal: new AbortController().signal })
    expect(rosterCalls().at(-1)).toMatchObject({ search: 'Staff 007', 'filter[active]': 'all' })
    expect(page.items.map((e) => anyEmployeeSource.toOption(e))).toEqual([
      { id: 'emp-7', label: 'Staff 007', sublabel: 'Counsellor', group: 'Disabled' },
    ])
  })
})

describe('the screens that show the whole roster (lane x)', () => {
  it('Employees asks for leavers too and loads every page, so nobody is cut off at 100', async () => {
    render(<EmployeesPage />, { wrapper })
    expect(await screen.findByText('Staff 150')).toBeInTheDocument()
    const calls = rosterCalls()
    expect(calls.every((q) => q['filter[active]'] === 'all')).toBe(true)
    expect(calls.map((q) => q.cursor)).toEqual([undefined, '100'])

    // The person who left is listed, and marked.
    const leaver = screen.getByText('Staff 007').closest('tr')!
    expect(within(leaver).getByText('Disabled')).toBeInTheDocument()
    expect(within(leaver).getByText('staff7@example.test')).toBeInTheDocument()
  })

  it('Employees: a summary row says "Not shown to you", never an empty email or "No access rights"', async () => {
    roster = [
      employee(1),
      employee(2, {
        detail: 'summary',
        designation_id: null,
        is_consultancy_admin: undefined,
        user: { id: 'user-2', first_name: 'Staff', last_name: '002', role: 'consultant', designation: 'Counsellor', email: null, phone: null },
      }),
    ]
    render(<EmployeesPage />, { wrapper })
    const row = (await screen.findByText('Staff 002')).closest('tr')!
    expect(within(row).getAllByText('Not shown to you').length).toBeGreaterThan(0)
    expect(within(row).queryByText('No access rights')).not.toBeInTheDocument()
    expect(within(row).queryByText('—')).not.toBeInTheDocument()
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()

    // The full row beside it is unchanged.
    const full = screen.getByText('Staff 001').closest('tr')!
    expect(within(full).getByText('staff1@example.test')).toBeInTheDocument()
    expect(within(full).getByRole('button', { name: 'Edit Staff 001' })).toBeInTheDocument()
  })

  it('the allocation rule lists everyone who works here now, past the hundredth, and nobody who left', async () => {
    const rosterAnswer = mockedGet.getMockImplementation() as unknown as (path: string, init?: unknown) => Promise<unknown>
    mockedGet.mockImplementation((async (path: string, init?: unknown) =>
      path === '/lead-allocation-rules'
        ? { data: { mode: 'round_robin', participating_employee_ids: [], capacity_per_consultant: null }, error: undefined }
        : rosterAnswer(path, init)) as never)
    render(<AllocationTab enabled />, { wrapper })
    expect(await screen.findByText('Staff 150')).toBeInTheDocument()
    expect(screen.queryByText('Staff 007')).not.toBeInTheDocument()
    expect(rosterCalls().every((q) => q['filter[active]'] === 'true')).toBe(true)
  })

  it('seats in use is the count of people who work here now, asked for without loading them', async () => {
    const { result } = renderHook(() => useActiveEmployeeCount(), { wrapper })
    await waitFor(() => expect(result.current.data).toBe(149))
    expect(rosterCalls()).toEqual([expect.objectContaining({ limit: 1, 'filter[active]': 'true' })])
  })
})

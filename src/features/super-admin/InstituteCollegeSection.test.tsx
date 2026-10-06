import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-155. Linking an institute to its college is permanent; it used to be sent on a single
// click. Now the click opens a confirmation that names the account and the college and shows the
// college's course count, and only "Link permanently" sends anything. The college is still found
// by searching the server (F-038), so one past the first hundred can be chosen.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), PATCH: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { InstituteCollegeSection } from './InstituteCollegeSection'

const mockedGet = vi.mocked(api.GET)
const mockedPatch = vi.mocked(api.PATCH)

const COLLEGES = [
  { id: 'col-1', name: 'Northfield College', course_count: 42 },
  { id: 'col-2', name: 'Northfield College of Arts', course_count: 0 },
  { id: 'col-3', name: 'Single Course Institute', course_count: 1 },
]

const INSTITUTE = { id: 'acc-1', name: 'Northfield Admissions', kind: 'institute', college_id: null } as never

function renderSection(consultancy = INSTITUTE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <InstituteCollegeSection consultancy={consultancy} />
    </QueryClientProvider>,
  )
}

async function choose(name: string, typed = 'north') {
  const input = screen.getByRole('combobox', { name: /College/ })
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: typed } })
  // An option reads "<name> <n> courses"; the name must match whole, since one college's name can
  // begin with another's.
  const isThisCollege = (text: string) => text.replace(/\s*\d+ courses?$/, '') === name
  fireEvent.click(await screen.findByRole('option', { name: isThisCollege }))
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPatch.mockReset()
  useAuthStore.setState({ accessToken: 'token', refreshToken: 'refresh' })
  mockedGet.mockImplementation((async (_path: string, init: { params?: { query?: { search?: string } } }) => {
    const search = (init?.params?.query?.search ?? '').toLowerCase()
    const items = COLLEGES.filter((c) => c.name.toLowerCase().includes(search))
    return { data: { items, meta: { next_cursor: null, total: items.length } }, error: undefined }
  }) as never)
  mockedPatch.mockResolvedValue({ data: { id: 'acc-1', college_id: 'col-1' }, error: undefined } as never)
})

describe('linking an institute to its college', () => {
  it('searches the server for the college as it is typed', async () => {
    renderSection()
    await choose('Northfield College')
    await waitFor(() =>
      expect(mockedGet).toHaveBeenCalledWith(
        '/colleges',
        expect.objectContaining({ params: expect.objectContaining({ query: expect.objectContaining({ search: 'north' }) }) }),
      ),
    )
  })

  it('sends nothing on "Link college": it asks first, naming the account, the college and its courses', async () => {
    renderSection()
    await choose('Northfield College')
    fireEvent.click(screen.getByRole('button', { name: 'Link college' }))

    const dialog = screen.getByRole('dialog', { name: 'Link this college?' })
    expect(within(dialog).getByText('Northfield Admissions')).toBeInTheDocument()
    expect(within(dialog).getByText('Northfield College')).toBeInTheDocument()
    expect(within(dialog).getByText('42 courses')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('This cannot be changed later.')
    expect(mockedPatch).not.toHaveBeenCalled()
  })

  it('links only on "Link permanently"', async () => {
    renderSection()
    await choose('Northfield College')
    fireEvent.click(screen.getByRole('button', { name: 'Link college' }))
    fireEvent.click(screen.getByRole('button', { name: 'Link permanently' }))

    await waitFor(() =>
      expect(mockedPatch).toHaveBeenCalledWith('/consultancies/{id}', {
        params: { path: { id: 'acc-1' } },
        body: { college_id: 'col-1' },
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('Cancel links nothing and leaves the choice in place', async () => {
    renderSection()
    await choose('Northfield College')
    fireEvent.click(screen.getByRole('button', { name: 'Link college' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockedPatch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Link college' })).toBeEnabled()
  })

  it('warns when the chosen college has no courses, the mark of a near-namesake', async () => {
    renderSection()
    await choose('Northfield College of Arts')
    fireEvent.click(screen.getByRole('button', { name: 'Link college' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('0 courses')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('This college has no courses yet. Check it is the right one and not a duplicate entry.')
  })

  it('says "1 course" for one', async () => {
    renderSection()
    await choose('Single Course Institute', 'single')
    fireEvent.click(screen.getByRole('button', { name: 'Link college' }))
    expect(within(screen.getByRole('dialog')).getByText('1 course')).toBeInTheDocument()
  })

  it("shows the server's refusal inside the confirmation", async () => {
    mockedPatch.mockResolvedValueOnce({
      data: undefined,
      error: { error: { code: 'college_already_linked', message: 'This account is already linked to a college.' } },
    } as never)
    renderSection()
    await choose('Northfield College')
    fireEvent.click(screen.getByRole('button', { name: 'Link college' }))
    fireEvent.click(screen.getByRole('button', { name: 'Link permanently' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This account is already linked to a college.')
  })

  it('cannot be started before a college is chosen', () => {
    renderSection()
    expect(screen.getByRole('button', { name: 'Link college' })).toBeDisabled()
  })
})

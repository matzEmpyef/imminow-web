import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// F-038: at each migrated site, a record that is NOT in the list's first page can be found by
// typing and then chosen — which the old pickers, filtering one loaded page in the browser, could
// not do. The fake server below holds 150 records per list and answers `search`, `cursor` and
// `limit` the way the real routes do.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { AddApplicationModal } from '@/features/clients/AddApplicationModal'
import { TransferApplicantModal } from '@/features/clients/TransferApplicantModal'
import { ShareDocumentMenu } from '@/features/administration/ShareDocumentMenu'
import { ConsultancySearchSelect } from '@/features/super-admin/finance/ConsultancySearchSelect'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

const pad = (n: number) => String(n).padStart(3, '0')
const range = Array.from({ length: 150 }, (_, i) => i + 1)

const LISTS: Record<string, { id: string; text: string }[]> = {
  '/courses': range.map((n) => ({ id: `course-${n}`, text: `Course ${pad(n)}` })),
  '/consultancies': range.map((n) => ({ id: `acc-${n}`, text: `Consultancy ${pad(n)}` })),
  '/clients': range.map((n) => ({ id: `client-${n}`, text: `Applicant ${pad(n)}` })),
}

function record(path: string, r: { id: string; text: string }) {
  if (path === '/courses') return { id: r.id, name: r.text, college_id: 'col-1', college_name: 'Test College', campuses: [] }
  if (path === '/consultancies') return { id: r.id, name: r.text, city: null }
  const [first, last] = r.text.split(' ')
  return { id: r.id, case_type: 'student', student: { first_name: first, last_name: last } }
}

type Query = { search?: string; cursor?: string; limit?: number }

function listCalls(path: string): Query[] {
  return (mockedGet.mock.calls as unknown[][])
    .filter((call) => call[0] === path)
    .map((call) => (call[1] as { params: { query: Query } }).params.query)
}

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const optionNames = () => screen.queryAllByRole('option').map((o) => o.textContent)

/** Opens the picker, checks the far record is not offered, then types its name and chooses it. */
async function findAndChoose(input: HTMLElement, firstPageName: string, farName: string) {
  fireEvent.focus(input)
  await waitFor(() => expect(optionNames().some((n) => n?.includes(firstPageName))).toBe(true))
  expect(optionNames().some((n) => n?.includes(farName))).toBe(false)

  fireEvent.change(input, { target: { value: farName } })
  const option = await screen.findByRole('option', { name: new RegExp(farName) })
  fireEvent.click(option)
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  mockedGet.mockImplementation((async (path: string, init?: { params?: { query?: Query } }) => {
    const list = LISTS[path]
    if (!list) return { data: { id: 'acc-own', name: 'Our Consultancy' }, error: undefined }
    const { search, cursor, limit = 20 } = init?.params?.query ?? {}
    const matching = list.filter((r) => !search || r.text.toLowerCase().includes(search.toLowerCase()))
    const start = cursor ? Number(cursor) : 0
    const end = start + limit
    return {
      data: {
        items: matching.slice(start, end).map((r) => record(path, r)),
        meta: { next_cursor: end < matching.length ? String(end) : null },
      },
      error: undefined,
    }
  }) as never)
  mockedPost.mockResolvedValue({ data: {}, error: undefined } as never)
})

describe('pickers moved to server search (F-038)', () => {
  it('Add a College: a course past the first page is found by typing and added', async () => {
    renderWithClient(<AddApplicationModal clientId="client-1" finalizedCountry={null} takenCourseIds={[]} onClose={vi.fn()} />)
    await findAndChoose(screen.getByRole('combobox', { name: 'Course' }), 'Course 001', 'Course 140')

    expect(listCalls('/courses').at(-1)).toMatchObject({ search: 'Course 140' })
    await waitFor(() => expect(mockedPost).toHaveBeenCalled())
    expect(mockedPost.mock.calls[0][0]).toBe('/clients/{id}/applications')
    expect((mockedPost.mock.calls[0][1] as { body: unknown }).body).toEqual({ course_id: 'course-140', campus_id: undefined })
  })

  it('Transfer Applicant: a consultancy past the first page is found by typing and submitted', async () => {
    renderWithClient(
      <TransferApplicantModal clientId="client-1" clientName="Asha Nair" onClose={vi.fn()} onTransferred={vi.fn()} />,
    )
    const input = screen.getByRole('combobox', { name: /New consultancy/ }) as HTMLInputElement
    await findAndChoose(input, 'Consultancy 001', 'Consultancy 140')
    expect(listCalls('/consultancies').at(-1)).toMatchObject({ search: 'Consultancy 140', active: true })
    expect(input.value).toBe('Consultancy 140')

    fireEvent.change(screen.getByPlaceholderText('Why is this applicant being transferred?'), { target: { value: 'Moving city' } })
    fireEvent.change(screen.getByLabelText('Transfer code'), { target: { value: '7F2K9C1A' } })
    fireEvent.change(screen.getByPlaceholderText('TRANSFER'), { target: { value: 'TRANSFER' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transfer Applicant' }))

    await waitFor(() => expect(mockedPost).toHaveBeenCalled())
    expect((mockedPost.mock.calls[0][1] as { body: unknown }).body).toEqual({
      new_consultancy_id: 'acc-140',
      reason: 'Moving city',
      transfer_code: '7F2K9C1A',
    })
  })

  it('Document Library share: an applicant past the first page is found by typing and confirmed', async () => {
    const onSelect = vi.fn()
    renderWithClient(<ShareDocumentMenu onSelect={onSelect} label="Share offer.pdf with an applicant" />)
    fireEvent.click(screen.getByRole('button', { name: 'Share offer.pdf with an applicant' }))
    await findAndChoose(screen.getByRole('combobox', { name: 'Applicant' }), 'Applicant 001', 'Applicant 140')
    expect(listCalls('/clients').at(-1)).toMatchObject({ search: 'Applicant 140' })

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onSelect).toHaveBeenCalledWith('client-140', 'Applicant 140')
  })

  it('Consultancy filter: an account past the first page is found by typing and set as the filter', async () => {
    const onChange = vi.fn()
    renderWithClient(<ConsultancySearchSelect value="" onChange={onChange} />)
    await findAndChoose(screen.getByRole('combobox', { name: 'Consultancy' }), 'Consultancy 001', 'Consultancy 140')
    expect(onChange).toHaveBeenCalledWith('acc-140')
  })

  it('Consultancy filter: pages on with the cursor the server returned', async () => {
    renderWithClient(<ConsultancySearchSelect value="" onChange={vi.fn()} />)
    fireEvent.focus(screen.getByRole('combobox', { name: 'Consultancy' }))
    await waitFor(() => expect(optionNames()).toHaveLength(30))
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(optionNames()).toHaveLength(60))
    expect(listCalls('/consultancies').at(-1)).toMatchObject({ cursor: '30', limit: 30 })
    expect(optionNames().at(-1)).toBe('Consultancy 060')
  })
})

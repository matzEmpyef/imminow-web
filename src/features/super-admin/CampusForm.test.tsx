import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner ruling 2026-10-09: a college may have several campuses in one city if their names differ;
// an unnamed campus is one per city and is shown by its city. The campus form carries an optional
// "Campus name" (Campus.name in the import contract), and the server's own sentence for it shows
// beside the field.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))

import { api } from '@/api/client'
import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, platformMe } from '@/test/me'
import { CollegeDetailPage } from './CollegeDetailPage'

const mockedGet = vi.mocked(api.GET)
const mockedPatch = vi.mocked(api.PATCH)

const HINT = 'Needed when a college has more than one campus in the same city.'

const COLLEGE = {
  id: 'col-1',
  name: 'Northfield University',
  active: true,
  visible: true,
  campuses: [
    {
      id: 'cp-1',
      name: 'Toronto Downtown',
      city: 'Toronto',
      province_state: 'Ontario',
      country: 'Canada',
      active: true,
      visible: true,
      course_count: 2,
    },
    {
      id: 'cp-2',
      name: null,
      city: 'Ottawa',
      province_state: 'Ontario',
      country: 'Canada',
      active: true,
      visible: true,
      course_count: 0,
    },
  ],
  fields_of_study: [],
  partner_consultancies: [],
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

beforeEach(() => {
  mockedGet.mockReset()
  mockedPatch.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ catalog: true })))
  mockedGet.mockImplementation((async (path: string) => {
    if (path === '/colleges/{id}') return { data: COLLEGE, error: undefined }
    if (path === '/courses') return { data: { items: [], meta: { next_cursor: null, total: 0 } }, error: undefined }
    return { data: [], error: undefined }
  }) as never)
})

describe('campus list on the college page', () => {
  it('shows a campus by its name when it has one, otherwise by its city', async () => {
    renderPage()
    expect(await screen.findByText('Toronto Downtown — Toronto, Ontario, Canada')).toBeInTheDocument()
    expect(screen.getByText('Ottawa, Ontario, Canada')).toBeInTheDocument()
  })
})

describe('campus form: Campus name', () => {
  it('is an optional field with the helper text, on both Add and Edit', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add Campus' }))
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Campus name')).not.toBeRequired()
    expect(within(dialog).getByText(HINT)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^Edit Toronto Downtown/ }))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Campus name')).toHaveValue('Toronto Downtown')
  })

  it('sends the name with the save, and null when it is cleared', async () => {
    mockedPatch.mockResolvedValue({ data: {}, error: undefined } as never)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /^Edit Toronto Downtown/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Campus name'), { target: { value: '  Toronto Midtown ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(mockedPatch).toHaveBeenCalledTimes(1))
    expect(mockedPatch.mock.calls[0][1]).toMatchObject({
      params: { path: { id: 'col-1', campusId: 'cp-1' } },
      body: { name: 'Toronto Midtown', city: 'Toronto', province_state: 'Ontario', country: 'Canada' },
    })

    mockedPatch.mockClear()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^Edit Toronto Downtown/ }))
    const second = await screen.findByRole('dialog')
    fireEvent.change(within(second).getByLabelText('Campus name'), { target: { value: '' } })
    fireEvent.click(within(second).getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(mockedPatch).toHaveBeenCalledTimes(1))
    expect((mockedPatch.mock.calls[0][1] as { body: { name: unknown } }).body.name).toBeNull()
  })

  it("shows the server's sentence beside the field on a refusal, not in the footer", async () => {
    mockedPatch.mockResolvedValue({
      data: undefined,
      error: {
        error: {
          code: 'duplicate_campus',
          message: 'This college already has a campus with that name or in that place.',
          details: { fields: { name: 'This college already has a campus called Toronto Midtown.' } },
        },
      },
    } as never)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /^Edit Ottawa/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Campus name'), { target: { value: 'Toronto Midtown' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    const message = await within(dialog).findByText('This college already has a campus called Toronto Midtown.')
    const field = within(dialog).getByLabelText('Campus name')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field.getAttribute('aria-describedby')).toBe(message.id)
    expect(within(dialog).queryByText('This college already has a campus with that name or in that place.')).not.toBeInTheDocument()

    // Changing the name clears the old refusal; the helper text is back.
    fireEvent.change(field, { target: { value: 'Ottawa South' } })
    expect(within(dialog).queryByText('This college already has a campus called Toronto Midtown.')).not.toBeInTheDocument()
    expect(within(dialog).getByText(HINT)).toBeInTheDocument()
  })

  it('falls back to the error message in the footer when the server names no field', async () => {
    mockedPatch.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'duplicate_campus', message: 'That campus already exists.' } },
    } as never)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /^Edit Ottawa/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Campus name'), { target: { value: 'X' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))
    expect(await within(dialog).findByText('That campus already exists.')).toBeInTheDocument()
  })
})

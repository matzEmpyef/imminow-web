import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-299: a phonebook contact can be edited (PATCH /phonebook/{id}, open to all staff), and
// removing the only row on a later page takes the list back to its first page.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: () => ({ isInstitute: false }) }))
const access = vi.hoisted(() => ({ isAdmin: false }))
vi.mock('@/lib/permissions', () => ({ usePermissionChecker: () => ({ can: () => true, isAdmin: access.isAdmin }) }))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { useAuthStore } from '@/stores/authStore'
import { PhonebookPage } from './PhonebookPage'

const mockedGet = vi.mocked(api.GET)
const mockedPatch = vi.mocked(api.PATCH)
const mockedDelete = vi.mocked(api.DELETE)

const anand = { id: 'c1', name: 'Anand Travels', category: 'Vendor', phone: '+91 98765 43210', email: 'a@example.com' }

function page(items: unknown[], next: string | null = null) {
  return {
    data: { items, meta: { next_cursor: next, categories: ['Vendor'] } },
    error: undefined,
    response: { status: 200 },
  } as never
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PhonebookPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPatch.mockReset()
  mockedDelete.mockReset()
  vi.mocked(showToast).mockClear()
  access.isAdmin = false
  // The list is only fetched for a signed-in session.
  useAuthStore.getState().setSession({ access_token: 'a', refresh_token: 'r' })
})

describe('Phonebook editing', () => {
  it('offers Edit to staff who cannot delete, and saves the change through PATCH', async () => {
    mockedGet.mockResolvedValue(page([anand]))
    mockedPatch.mockResolvedValue({ data: { ...anand, phone: '+91 90000 00000' }, error: undefined, response: { status: 200 } } as never)
    renderPage()

    expect(await screen.findByText('Anand Travels')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Anand Travels' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Anand Travels' }))

    const phone = await screen.findByLabelText(/^Phone/)
    expect(phone).toHaveValue('+91 98765 43210')
    fireEvent.change(phone, { target: { value: '+91 90000 00000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedPatch).toHaveBeenCalledWith('/phonebook/{id}', {
        params: { path: { id: 'c1' } },
        body: { name: 'Anand Travels', category: 'Vendor', phone: '+919000000000', email: 'a@example.com' },
      }),
    )
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Anand Travels saved'))
  })
})

describe('Phonebook deleting', () => {
  it('goes back to the first page when the only row of a later page is removed', async () => {
    access.isAdmin = true
    // First page has a next page; the second holds one contact.
    mockedGet.mockImplementation((async (_path: string, init: { params: { query: { cursor?: string } } }) =>
      init.params.query.cursor ? page([anand]) : page([{ ...anand, id: 'c0', name: 'First Page Co' }], 'cur-2')) as never)
    mockedDelete.mockResolvedValue({ data: undefined, error: undefined, response: { status: 204 } } as never)
    renderPage()

    await screen.findByText('First Page Co')
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    await screen.findByText('Anand Travels')

    fireEvent.click(screen.getByRole('button', { name: 'Remove Anand Travels' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('First Page Co')).toBeInTheDocument()
    expect(mockedDelete).toHaveBeenCalledWith('/phonebook/{id}', { params: { path: { id: 'c1' } } })
  })
})

// 2026-10-08: the server orders the phonebook (`sort`), so a column sort covers every page.
describe('Phonebook sorting', () => {
  const sortsAsked = () =>
    (mockedGet.mock.calls as unknown[][]).map(
      ([, init]) => (init as { params: { query: { sort?: string } } }).params.query.sort,
    )

  it('asks the server for the order instead of reordering the loaded page', async () => {
    const zed = { ...anand, id: 'c2', name: 'Zed Couriers' }
    mockedGet.mockResolvedValue(page([zed, anand]))
    renderPage()
    expect(await screen.findByText('Anand Travels')).toBeInTheDocument()
    expect(sortsAsked()).toEqual([undefined])

    fireEvent.click(screen.getByRole('button', { name: /^Name/ }))
    await waitFor(() => expect(sortsAsked().at(-1)).toBe('name'))
    fireEvent.click(screen.getByRole('button', { name: /^Name/ }))
    await waitFor(() => expect(sortsAsked().at(-1)).toBe('-name'))
    fireEvent.click(screen.getByRole('button', { name: /^Category/ }))
    await waitFor(() => expect(sortsAsked().at(-1)).toBe('category'))

    // The rows stay in the order the server sent them.
    const names = screen.getAllByText(/Zed Couriers|Anand Travels/).map((el) => el.textContent)
    expect(names).toEqual(['Zed Couriers', 'Anand Travels'])
  })
})

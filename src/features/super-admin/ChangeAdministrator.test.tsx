import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Support changes a consultancy's administrator (owner's ruling D-122(a), Phase 8). Pinned: the
// action is offered to the Support Tools permission only; the picker lists the consultancy's active
// staff who have accepted their invitation, without the current administrator; a reason of at least
// three characters and the operator's own password are needed, with a "Still needed" line beside the
// off button; and every refusal is the server's own sentence, beside the form.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, platformMe } from '@/test/me'
import type { components } from '@/api/schema'
import { ConsultancyDetail } from './ManageConsultanciesPage'

type Consultancy = components['schemas']['Consultancy']

configure({ asyncUtilTimeout: 5000 })

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

const STAFF = [
  { id: 'e-priya', is_consultancy_admin: true, active: true, status: 'active', name: 'Priya Nair', email: 'priya@example.com' },
  { id: 'e-arjun', is_consultancy_admin: false, active: true, status: 'active', name: 'Arjun Rao', email: 'arjun@example.com' },
  { id: 'e-fatima', is_consultancy_admin: false, active: true, status: 'invited', name: 'Fatima Khan', email: 'fatima@example.com' },
  { id: 'e-omar', is_consultancy_admin: false, active: false, status: 'deactivated', name: 'Omar Sheikh', email: 'omar@example.com' },
  { id: 'e-lena', is_consultancy_admin: false, active: true, status: 'active', user: { first_name: 'Lena', last_name: 'Park', email: 'lena@example.com' } },
]

const CONSULTANCY = {
  id: 'c1',
  name: 'Northwind Education',
  kind: 'consultancy',
  active: true,
  staff_blocked: false,
  kyc_verified: true,
  tier: 'business',
  seat_limit: 10,
  seats_used: 4,
  employees: STAFF,
} as unknown as Consultancy

function renderDetail(consultancy: Consultancy = CONSULTANCY) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ConsultancyDetail consultancy={consultancy} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { invalidate }
}

function handoverCalls() {
  return (mockedPost.mock.calls as unknown[][]).filter((call) => call[0] === '/consultancies/{id}/admin-handover')
}

function refuse(status: number, code: string, message: string, details?: Record<string, unknown>) {
  mockedPost.mockResolvedValueOnce({
    data: undefined,
    error: { error: { code, message, request_id: 'r1', details } },
    response: { status },
  } as never)
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Change administrator' }))
  return screen.getByRole('dialog', { name: 'Change administrator' })
}

function submitButton(dialog: HTMLElement) {
  return within(dialog).getAllByRole('button', { name: 'Change administrator' }).at(-1)!
}

function fillAll(dialog: HTMLElement, who = 'e-arjun') {
  fireEvent.change(within(dialog).getByLabelText(/New administrator/), { target: { value: who } })
  fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'The owner has left the business' } })
  fireEvent.change(within(dialog).getByLabelText(/Your password/), { target: { value: 'typed-secret' } })
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  vi.mocked(showToast).mockClear()
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ support_tools: true })))
  mockedGet.mockResolvedValue({ data: { items: [], meta: { next_cursor: null } }, error: undefined } as never)
})

describe('who is offered Change administrator', () => {
  it('shows it to a person holding the Support Tools permission', () => {
    renderDetail()
    expect(screen.getByRole('button', { name: 'Change administrator' })).toBeInTheDocument()
  })

  it('shows it to nobody else', () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ consultancy_approval: true, support: true, finance: true })))
    renderDetail()
    expect(screen.queryByRole('button', { name: 'Change administrator' })).not.toBeInTheDocument()
  })
})

describe('the Change administrator dialog', () => {
  it('lists active staff who have accepted, without the current administrator, and says what happens', () => {
    renderDetail()
    const dialog = openDialog()
    const options = within(dialog)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['Choose a member of staff', 'Arjun Rao (arjun@example.com)', 'Lena Park (lena@example.com)'])
    expect(
      within(dialog).getByText('The current administrator stays on the staff with full access to its work. Both people are told.'),
    ).toBeInTheDocument()
  })

  it('keeps the button off and names what is still needed', () => {
    renderDetail()
    const dialog = openDialog()
    const submit = submitButton(dialog)
    expect(submit).toBeDisabled()
    expect(
      within(dialog).getByText('Still needed: the new administrator, a reason (at least 3 characters), your password.'),
    ).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText(/New administrator/), { target: { value: 'e-arjun' } })
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'ab' } })
    fireEvent.change(within(dialog).getByLabelText(/Your password/), { target: { value: 'x' } })
    expect(submit).toBeDisabled()
    expect(within(dialog).getByText('Still needed: a reason (at least 3 characters).')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'abc' } })
    expect(submit).toBeEnabled()
    expect(within(dialog).queryByText(/Still needed/)).not.toBeInTheDocument()
  })

  it('sends the choice, the reason and the password, then reloads the consultancy and says who is now administrator', async () => {
    mockedPost.mockResolvedValueOnce({
      data: {
        consultancy_id: 'c1',
        consultancy_name: 'Northwind Education',
        admin_employee_id: 'e-arjun',
        former_admin_employee_id: 'e-priya',
      },
      error: undefined,
      response: { status: 200 },
    } as never)
    const { invalidate } = renderDetail()
    const dialog = openDialog()
    fillAll(dialog)
    fireEvent.click(submitButton(dialog))

    await waitFor(() => expect(handoverCalls()).toHaveLength(1))
    expect(handoverCalls()[0][1]).toEqual({
      params: { path: { id: 'c1' } },
      body: { employee_id: 'e-arjun', reason: 'The owner has left the business', password: 'typed-secret' },
    })
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Arjun Rao is now the administrator of Northwind Education.'),
    )
    expect(screen.queryByRole('dialog', { name: 'Change administrator' })).not.toBeInTheDocument()
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['admin-consultancies'])
  })

  it.each([
    [409, 'conflict', 'This person is already the administrator.'],
    [
      409,
      'conflict',
      "This person's access is switched off. Only an active member of staff can become the administrator.",
    ],
    [
      409,
      'conflict',
      'This person has not accepted their invitation yet. They can become the administrator once they have signed in.',
    ],
    [404, 'not_found', "This person is not a member of this consultancy's staff."],
    [400, 'validation_failed', 'Say why the administrator is being changed. The reason is kept on the record.'],
    [403, 'forbidden', 'You do not have permission to do this.'],
  ])('shows the server sentence beside the form: %s %s', async (status, code, message) => {
    refuse(status, code, message)
    renderDetail()
    const dialog = openDialog()
    fillAll(dialog)
    fireEvent.click(submitButton(dialog))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    expect(showToast).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Change administrator' })).toBeInTheDocument()
  })

  it('puts a refused password beside the password field, in the server’s words', async () => {
    refuse(400, 'invalid_current_password', 'That password is not correct.')
    renderDetail()
    const dialog = openDialog()
    fillAll(dialog)
    fireEvent.click(submitButton(dialog))

    expect(await within(dialog).findByText('That password is not correct.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Your password/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('says how long to wait after too many wrong passwords', async () => {
    refuse(429, 'rate_limited', 'Too many attempts. Please wait before trying again.', { retry_after_seconds: 600 })
    renderDetail()
    const dialog = openDialog()
    fillAll(dialog)
    fireEvent.click(submitButton(dialog))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Too many attempts. Please wait before trying again.')
    expect(within(dialog).getByText('You can try again in about 10 minutes.')).toBeInTheDocument()
  })

  it('says so when nobody else can be chosen', () => {
    renderDetail({ ...CONSULTANCY, employees: [STAFF[0], STAFF[2]] } as unknown as Consultancy)
    const dialog = openDialog()
    expect(
      within(dialog).getByText(
        'There is no one to choose yet. The new administrator must be an active member of staff who has accepted their invitation.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/New administrator/)).not.toBeInTheDocument()
  })

  it('says so when the record carries no staff list', () => {
    renderDetail({ ...CONSULTANCY, employees: undefined } as unknown as Consultancy)
    const dialog = openDialog()
    expect(within(dialog).getByText(/staff list could not be shown/)).toBeInTheDocument()
  })
})

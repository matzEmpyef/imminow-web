import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// DECISIONS 117 C-13 and 134(a), Phase 8: "Undo acceptance" is offered to the admin, the assigned
// consultant and holders of clients.revert_acceptance, and the server's 403 and 409 `part_settled`
// sentences are shown as served.
const staff = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('@/lib/me', () => ({ useMeStaff: () => staff.value }))
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/clients', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/clients')>()),
  useClient: () => ({ data: { payer_method: 'college', assigned_employee_id: 'e-assigned', student: { first_name: 'Aarav' } } }),
  useApplications: () => ({
    isLoading: false,
    data: [
      {
        id: 'a1',
        status: 'accepted',
        campus: null,
        course: { id: 'c1', name: 'MSc Data', college_id: 'col1', college_name: 'Ironbridge', country: 'United Kingdom', fee: null },
      },
    ],
  }),
  useUpdateApplication: () => ({ mutate: vi.fn(), isPending: false, isError: false, variables: undefined }),
}))
vi.mock('@/components/CountryLabel', () => ({
  CountryLabel: ({ name }: { name: string }) => <>{name}</>,
  CountryLabelList: ({ names }: { names: string[] }) => <>{names.join(', ')}</>,
}))
vi.mock('./AddApplicationModal', () => ({ AddApplicationModal: () => null }))
vi.mock('./AcceptCollegeModal', () => ({ AcceptCollegeModal: () => null }))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: () => ({ isInstitute: false }) }))
vi.mock('@/queries/partnerColleges', () => ({ usePartnerColleges: () => ({ data: [] }) }))

import { api } from '@/api/client'
import { ApplicationsTab } from './ClientProfileApplicationsTab'
import { PERMISSION_GROUPS } from '@/lib/permissions'

const me = (over: Record<string, unknown> = {}) => ({ is_admin: false, employee_id: 'e-me', permissions: [], ...over })

function renderTab() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MemoryRouter>
        <ApplicationsTab clientId="cl1" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => vi.mocked(api.POST).mockReset())

describe('Applications tab, "Undo acceptance"', () => {
  it('is offered to the admin', () => {
    staff.value = me({ is_admin: true })
    renderTab()
    expect(screen.getByRole('button', { name: 'Undo acceptance' })).toBeInTheDocument()
  })

  it('is offered to the consultant the client is assigned to', () => {
    staff.value = me({ employee_id: 'e-assigned' })
    renderTab()
    expect(screen.getByRole('button', { name: 'Undo acceptance' })).toBeInTheDocument()
  })

  it('is offered to a holder of clients.revert_acceptance', () => {
    staff.value = me({ permissions: ['clients.revert_acceptance'] })
    renderTab()
    expect(screen.getByRole('button', { name: 'Undo acceptance' })).toBeInTheDocument()
  })

  it('is not offered to anyone else who can open the client', () => {
    staff.value = me({ permissions: ['clients.view_all', 'clients.close'] })
    renderTab()
    expect(screen.getByText('Accepted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo acceptance' })).toBeNull()
  })

  it('shows the 409 part_settled sentence as served', async () => {
    staff.value = me({ is_admin: true })
    const SENTENCE = 'Payments have been recorded on this acceptance. Void each recorded instalment first, then undo the acceptance.'
    vi.mocked(api.POST).mockResolvedValue({
      data: undefined,
      error: { error: { code: 'part_settled', message: SENTENCE, status: 409 } },
      response: { status: 409 },
    } as never)
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: 'Undo acceptance' }))
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Wrong college chosen' } })
    // Two buttons share the name once the dialog is open: the one in the dialog's footer submits.
    const buttons = screen.getAllByRole('button', { name: 'Undo acceptance' })
    fireEvent.click(buttons[buttons.length - 1])
    expect(await screen.findByText(SENTENCE)).toBeInTheDocument()
    await waitFor(() => expect(vi.mocked(api.POST)).toHaveBeenCalled())
  })

  it('shows the 403 sentence as served', async () => {
    staff.value = me({ is_admin: true })
    const SENTENCE = 'Only the admin, the consultant this client is assigned to, or someone with permission to undo an acceptance can do this.'
    vi.mocked(api.POST).mockResolvedValue({
      data: undefined,
      error: { error: { code: 'permission_denied', message: SENTENCE, status: 403 } },
      response: { status: 403 },
    } as never)
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: 'Undo acceptance' }))
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Wrong college chosen' } })
    const buttons = screen.getAllByRole('button', { name: 'Undo acceptance' })
    fireEvent.click(buttons[buttons.length - 1])
    expect(await screen.findByText(SENTENCE)).toBeInTheDocument()
  })
})

describe('the permission editors', () => {
  it('list "Undo a college acceptance" with the other Clients keys, after Close', () => {
    const clients = PERMISSION_GROUPS.find((g) => g.key === 'clients')!
    const keys = clients.permissions.map((p) => p.key)
    expect(keys.indexOf('clients.revert_acceptance')).toBe(keys.indexOf('clients.close') + 1)
    expect(clients.permissions.find((p) => p.key === 'clients.revert_acceptance')?.label).toBe('Undo a college acceptance')
  })
})

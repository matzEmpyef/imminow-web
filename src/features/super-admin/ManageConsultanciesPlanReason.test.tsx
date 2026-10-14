import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 8 T2-04 / T4-09: a plan change is kept in the audit log with a reason typed by the
// platform user. The reason box is required, the Save button says what is still needed, and a
// refusal shows the sentence the server gave.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))

import { api } from '@/api/client'
import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, platformMe } from '@/test/me'
import type { components } from '@/api/schema'
import { ConsultancyDetail } from './ManageConsultanciesPage'

type Consultancy = components['schemas']['Consultancy']

const ACTIVE = {
  id: 'c1',
  name: 'Northwind Education',
  kind: 'consultancy',
  active: true,
  kyc_verified: true,
  tier: 'business',
  seat_limit: 10,
  seats_used: 4,
} as unknown as Consultancy

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ConsultancyDetail consultancy={ACTIVE} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function openPlanTab() {
  fireEvent.click(screen.getByRole('tab', { name: /Plan & features/ }))
}

function chooseUltimate() {
  fireEvent.change(screen.getByRole('combobox', { name: /Plan/ }), { target: { value: 'ultimate' } })
}

beforeEach(() => {
  vi.mocked(api.GET).mockReset()
  vi.mocked(api.PATCH).mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ consultancy_approval: true, finance: true })))
  vi.mocked(api.GET).mockResolvedValue({ data: { items: [], meta: { next_cursor: null } }, error: undefined } as never)
})

describe('changing a plan', () => {
  it('asks for a reason, keeps Save off without one, and sends it with the plan', async () => {
    vi.mocked(api.PATCH).mockResolvedValue({ data: { ...ACTIVE, tier: 'ultimate' }, error: undefined } as never)
    renderDetail()
    openPlanTab()
    expect(screen.queryByLabelText('Reason for the plan change')).not.toBeInTheDocument()

    chooseUltimate()
    expect(screen.getByLabelText('Reason for the plan change')).toBeInTheDocument()
    expect(screen.getByText('Still needed: the reason for the plan change.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Reason for the plan change'), { target: { value: '  Paid for a year  ' } })
    expect(screen.queryByText(/Still needed/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(vi.mocked(api.PATCH)).toHaveBeenCalled())
    const call = vi.mocked(api.PATCH).mock.calls[0] as unknown as [string, { body: unknown }]
    expect(call[0]).toBe('/consultancies/{id}/tier')
    expect(call[1].body).toEqual({ tier: 'ultimate', reason: 'Paid for a year' })
  })

  it('shows the sentence the server refused with', async () => {
    vi.mocked(api.PATCH).mockResolvedValue({
      data: undefined,
      error: { error: { code: 'validation_failed', message: 'Type the reason for this plan change.' } },
    } as never)
    renderDetail()
    openPlanTab()
    chooseUltimate()
    fireEvent.change(screen.getByLabelText('Reason for the plan change'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Type the reason for this plan change.')).toBeInTheDocument()
  })
})

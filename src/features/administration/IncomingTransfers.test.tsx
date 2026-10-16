import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The Incoming Transfers list (second erasure review). A code whose student's contact was removed
// afterwards has both contacts null and reads `expired`: the row says "Contact removed" rather than
// showing an error or a blank.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { IncomingTransfersTab } from './ConsultancyIncomingTransfersTab'

const mockedGet = vi.mocked(api.GET)

function code(overrides: Record<string, unknown>) {
  return {
    code: 'TC-0001',
    student_email: null,
    student_phone: null,
    status: 'active',
    expires_at: '2026-10-10T09:00:00Z',
    created_at: '2026-10-07T09:00:00Z',
    ...overrides,
  }
}

function renderTab(isInstitute = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <IncomingTransfersTab isInstitute={isInstitute} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockedGet.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('the Incoming Transfers list', () => {
  it('shows "Contact removed" for a code with no contact left, with its status, and no error', async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        items: [
          code({ code: 'TC-0001', student_email: 'meera@example.test' }),
          code({ code: 'TC-0002', student_phone: '+919876543210' }),
          code({ code: 'TC-0003', status: 'expired' }),
        ],
        meta: { next_cursor: null, total: 3 },
      },
      error: undefined,
    } as never)
    renderTab()
    const removed = (await screen.findByText('TC-0003')).closest('tr')!
    expect(within(removed).getByText('Contact removed')).toBeInTheDocument()
    expect(within(removed).getByText('Expired')).toBeInTheDocument()
    expect(screen.queryByText('Could not load transfer codes.')).not.toBeInTheDocument()
    expect(screen.getAllByText('Contact removed')).toHaveLength(1)
    // The rows that still have a contact show it, as before.
    expect(within(screen.getByText('TC-0001').closest('tr')!).getByText('meera@example.test')).toBeInTheDocument()
    expect(within(screen.getByText('TC-0002').closest('tr')!).getByText('+919876543210')).toBeInTheDocument()
  })
})

// Owner's ruling 2026-10-10: receiving a transferred student is open to every plan (the permission
// is the only gate, applied by the page), so the tab carries no plan check of its own. Only a
// university account is refused.
describe('issuing a transfer code', () => {
  const EMPTY = { data: { items: [], meta: { next_cursor: null, total: 0 } }, error: undefined } as never

  it('is offered with no plan entitlement to check', async () => {
    mockedGet.mockResolvedValue(EMPTY)
    renderTab()
    expect(await screen.findByRole('button', { name: /Issue a code/ })).toBeInTheDocument()
  })

  it('hides the Issue action for an institute account and says why', async () => {
    mockedGet.mockResolvedValue(EMPTY)
    renderTab(true)
    expect(await screen.findByText(/An institute cannot receive students transferred from a consultancy/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Issue a code/ })).not.toBeInTheDocument()
  })

  // T4-18: the phone help text and the console's own check say the one sentence the server says.
  it('gives the phone field the one phone sentence as its help, and as its message for a bad number', async () => {
    const sentence = 'Enter the phone number with the country code, for example +919876543210.'
    mockedGet.mockResolvedValue(EMPTY)
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: /Issue a code/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Phone' }))
    expect(within(dialog).getByText(sentence)).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText(/registered phone/), { target: { value: 'call me' } })
    expect(within(dialog).getAllByText(sentence)).toHaveLength(1)
    expect(within(dialog).getByLabelText(/registered phone/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows the server’s sentence when the code is refused', async () => {
    mockedGet.mockResolvedValue(EMPTY)
    vi.mocked(api.POST).mockResolvedValue({
      data: undefined,
      error: {
        error: {
          code: 'feature_locked',
          message: 'A university account cannot receive transferred students.',
          status: 403,
        },
      },
      response: { status: 403 },
    } as never)
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: /Issue a code/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/registered email/), { target: { value: 'meera@example.test' } })
    fireEvent.change(within(dialog).getByLabelText(/^Reason/), { target: { value: 'Moving cities' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue code' }))
    await waitFor(() =>
      expect(within(dialog).getByText('A university account cannot receive transferred students.')).toBeInTheDocument(),
    )
  })
})

// Phase 8 T2-03: the consultancy that issued a code can take it back before it is used.
describe('withdrawing a transfer code', () => {
  const TWO = {
    data: {
      items: [
        code({ code: 'TC-0001', student_email: 'meera@example.test', status: 'active' }),
        code({ code: 'TC-0002', student_email: 'ravi@example.test', status: 'used' }),
        code({ code: 'TC-0003', student_email: 'anu@example.test', status: 'withdrawn' }),
      ],
      meta: { next_cursor: null, total: 3 },
    },
    error: undefined,
  } as never

  it('offers Withdraw on an unused code only, and shows a withdrawn code as Withdrawn', async () => {
    mockedGet.mockResolvedValue(TWO)
    renderTab()
    await screen.findByText('TC-0001')
    expect(screen.getAllByRole('button', { name: 'Withdraw' })).toHaveLength(1)
    expect(within(screen.getByText('TC-0003').closest('tr')!).getByText('Withdrawn')).toBeInTheDocument()
  })

  it('asks first, then withdraws the code', async () => {
    mockedGet.mockResolvedValue(TWO)
    vi.mocked(api.POST).mockReset()
    vi.mocked(api.POST).mockResolvedValue({ data: {}, error: undefined } as never)
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }))
    expect(api.POST).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Withdraw transfer code' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Withdraw' }))
    await waitFor(() => expect(api.POST).toHaveBeenCalled())
    const call = vi.mocked(api.POST).mock.calls[0] as unknown as [string, { params: { path: { code: string } } }]
    expect(call[0]).toBe('/transfer-codes/{code}/withdraw')
    expect(call[1].params.path.code).toBe('TC-0001')
  })

  it('shows the server’s sentence when the code was already used', async () => {
    mockedGet.mockResolvedValue(TWO)
    vi.mocked(api.POST).mockReset()
    vi.mocked(api.POST).mockResolvedValue({
      data: undefined,
      error: { error: { code: 'conflict', message: 'This code has already been used, so it cannot be withdrawn.', status: 409 } },
    } as never)
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }))
    const dialog = screen.getByRole('dialog', { name: 'Withdraw transfer code' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Withdraw' }))
    expect(await within(dialog).findByText('This code has already been used, so it cannot be withdrawn.')).toBeInTheDocument()
  })
})

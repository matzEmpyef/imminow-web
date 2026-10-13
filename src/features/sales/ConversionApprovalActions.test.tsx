import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The lead page's conversion offer (contract gate 12f): staff can cancel their own pending offer
// after a confirm, a proposal that was taken back says so in plain words, and a suspended
// consultancy is told why its offer was not sent.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { ALREADY_APPLIED_NOTICE } from '@/lib/useIdempotencyKey'
import { ConversionApprovalActions } from './ConversionApprovalActions'
import { ConvertToClientModal } from './ConvertToClientModal'
import type { components } from '@/api/schema'

type ConversionProposal = components['schemas']['ConversionProposal']

const mockedPost = vi.mocked(api.POST)
const mockedDelete = vi.mocked(api.DELETE)

// The full suite runs these under load; a slow first render must not fail a correct test.
configure({ asyncUtilTimeout: 5000 })

function proposal(overrides: Partial<ConversionProposal> = {}): ConversionProposal {
  return {
    id: 'p1',
    status: 'pending',
    initiated_by: 'consultant',
    sent_at: '2026-10-06T09:00:00Z',
    expires_at: '2026-10-20T09:00:00Z',
    ...overrides,
  } as ConversionProposal
}

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
  return { invalidate }
}

beforeEach(() => {
  mockedPost.mockReset()
  mockedDelete.mockReset()
  vi.mocked(showToast).mockClear()
  mockedDelete.mockImplementation((async () => ({
    data: { id: 'p1', status: 'cancelled' },
    error: undefined,
    response: { status: 200 },
  })) as never)
})

describe('ConversionApprovalActions — the new proposal statuses', () => {
  it.each([
    ['withdrawn', 'The student withdrew their request'],
    ['cancelled', 'Cancelled'],
  ] as const)('%s reads "%s" and offers no buttons', (status, words) => {
    renderWithClient(
      <ConversionApprovalActions canConvert leadId="l1" leadName="Asha Rao" proposal={proposal({ status, initiated_by: 'student' })} />,
    )
    expect(screen.getByText(words)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('ConversionApprovalActions — cancelling an offer the consultancy sent', () => {
  it('asks first, then cancels through DELETE /conversion-proposals/{id} and refreshes the lead', async () => {
    const { invalidate } = renderWithClient(
      <ConversionApprovalActions canConvert leadId="l1" leadName="Asha Rao" proposal={proposal()} />,
    )
    expect(screen.getByText(/Awaiting Asha Rao's response/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel offer' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel offer' })
    expect(dialog).toHaveTextContent('Cancel this offer? Asha Rao will no longer be able to accept it.')
    expect(mockedDelete).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel offer' }))
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Offer cancelled'))
    const [path, init] = mockedDelete.mock.calls[0] as unknown as [string, { params: { path: { id: string } } }]
    expect(path).toBe('/conversion-proposals/{id}')
    expect(init.params.path.id).toBe('p1')
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['leads'])
    expect(keys).toContainEqual(['applicant-requests'])
  })

  it("a student's own request has Approve and Decline and no Cancel offer", () => {
    renderWithClient(
      <ConversionApprovalActions canConvert leadId="l1" leadName="Asha Rao" proposal={proposal({ initiated_by: 'student' })} />,
    )
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel offer' })).not.toBeInTheDocument()
  })

  // Owner decision 6 (review F-055): answering a student's request needs "convert leads".
  it("without the convert permission, a student's request is shown as a fact with no buttons", () => {
    renderWithClient(
      <ConversionApprovalActions
        canConvert={false}
        leadId="l1"
        leadName="Asha Rao"
        proposal={proposal({ initiated_by: 'student' })}
      />,
    )
    expect(screen.getByText('Asha Rao has asked to become a client')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument()
  })

  it('without it, an offer the consultancy sent can still be cancelled (that needs only sight of the lead)', () => {
    renderWithClient(
      <ConversionApprovalActions canConvert={false} leadId="l1" leadName="Asha Rao" proposal={proposal()} />,
    )
    expect(screen.getByRole('button', { name: 'Cancel offer' })).toBeInTheDocument()
  })
})

// Review F-297: Approve sent a new key on every press, so a retry after a lost reply was refused
// as "already done" and read as a failure although the first press had worked.
describe('ConversionApprovalActions - pressing Approve again after a lost reply', () => {
  it('sends the same key, and an already-applied answer reads as done, not as a failure', async () => {
    mockedPost
      .mockResolvedValueOnce({
        data: undefined,
        error: { error: { code: 'bad_gateway', message: 'upstream', status: 502 } },
        response: { status: 502 },
      } as never)
      .mockResolvedValueOnce({
        data: undefined,
        error: {
          error: { code: 'conflict', message: 'Already done.', status: 409, details: { idempotency: 'already_applied' } },
        },
        response: { status: 409 },
      } as never)
    const { invalidate } = renderWithClient(
      <ConversionApprovalActions canConvert leadId="l1" leadName="Asha Rao" proposal={proposal({ initiated_by: 'student' })} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1))
    await screen.findByText('upstream')
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(ALREADY_APPLIED_NOTICE))

    const keyOf = (i: number) =>
      (mockedPost.mock.calls[i][1] as unknown as { params: { header: Record<string, string> } }).params.header[
        'Idempotency-Key'
      ]
    expect(keyOf(1)).toBe(keyOf(0))
    expect(screen.queryByText('Already done.')).not.toBeInTheDocument()
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['clients'])
  })
})

describe('ConvertToClientModal — sending an offer', () => {
  it('409 consultancy_unavailable shows the server message', async () => {
    mockedPost.mockImplementation((async () => ({
      data: undefined,
      error: {
        error: { code: 'consultancy_unavailable', message: "This consultancy isn't taking on new clients right now." },
      },
      response: { status: 409 },
    })) as never)
    renderWithClient(<ConvertToClientModal leadId="l1" leadName="Asha Rao" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByText("This consultancy isn't taking on new clients right now.")).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Request sent' })).not.toBeInTheDocument()
  })
})

// Phase 8, D-119 C-7(2): converting an imported lead whose email or phone is held by an account
// that cannot be asked answers 409 `identifier_in_use` with one neutral sentence. The console
// shows it exactly as served.
describe('converting an imported lead whose email or phone is held', () => {
  const SENTENCE = 'This address cannot be used. Please ask the applicant to provide a different email address.'
  const refuse = () =>
    mockedPost.mockImplementation((async () => ({
      data: undefined,
      error: { error: { code: 'identifier_in_use', message: SENTENCE } },
      response: { status: 409 },
    })) as never)

  it('shows the sentence when the offer is sent', async () => {
    refuse()
    renderWithClient(<ConvertToClientModal leadId="l1" leadName="Asha Rao" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByText(SENTENCE)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Request sent' })).not.toBeInTheDocument()
  })

  it('shows the sentence when a request is approved', async () => {
    refuse()
    renderWithClient(
      <ConversionApprovalActions
        canConvert
        leadId="l1"
        leadName="Asha Rao"
        proposal={proposal({ initiated_by: 'student' })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText(SENTENCE)).toBeInTheDocument()
  })
})

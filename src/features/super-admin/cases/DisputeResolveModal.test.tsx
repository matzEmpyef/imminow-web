import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner ruling 3 (2026-10-07): when Support erased a student's account with a dispute open, the
// case is already closed and the dispute can only be closed. The server refuses `resume` and
// `reassign` (409 `conflict`); the modal then shows that sentence and offers only "Close dispute".
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { api } from '@/api/client'
import type { CaseDispute } from '@/queries/disputes'
import { DisputeResolveModal } from './DisputeResolveModal'

const mockedPost = vi.mocked(api.POST)

const DISPUTE = { id: 'd1', journey_id: 'j1', student_name: 'Meera Pillai', status: 'open' } as unknown as CaseDispute
const CLOSE_ONLY = 'This student’s account was deleted. The dispute can only be closed.'

function refused(status: number, code: string, message: string) {
  return { data: undefined, error: { error: { code, message, status } }, response: { status } } as never
}

const onResolved = vi.fn()
const onClose = vi.fn()

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DisputeResolveModal dispute={DISPUTE} onClose={onClose} onResolved={onResolved} />
    </QueryClientProvider>,
  )
}

function decide(label: string) {
  fireEvent.click(screen.getByText(label))
  fireEvent.change(screen.getByLabelText('What was decided, and why'), { target: { value: 'Spoke to both sides.' } })
}

beforeEach(() => {
  mockedPost.mockReset()
  onResolved.mockClear()
  onClose.mockClear()
})

describe('resolving a dispute', () => {
  it('offers all three decisions to begin with', () => {
    renderModal()
    expect(screen.getByText('Resume the case')).toBeInTheDocument()
    expect(screen.getByText('Move the student')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument()
  })

  it('offers only "Close dispute" once the server says the account was deleted, then closes it', async () => {
    mockedPost.mockResolvedValueOnce(refused(409, 'conflict', CLOSE_ONLY))
    renderModal()
    decide('Resume the case')
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(CLOSE_ONLY)
    expect(screen.queryByText('Resume the case')).not.toBeInTheDocument()
    expect(screen.queryByText('Move the student')).not.toBeInTheDocument()
    expect(screen.getByText(/changes neither the case nor any commission/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    mockedPost.mockResolvedValueOnce({ data: { ...DISPUTE, status: 'resolved' }, error: undefined } as never)
    fireEvent.click(screen.getByRole('button', { name: 'Close dispute' }))
    await waitFor(() =>
      expect(mockedPost).toHaveBeenLastCalledWith('/disputes/{id}/resolve', {
        params: { path: { id: 'd1' } },
        body: { action: 'close', resolution_note: 'Spoke to both sides.' },
      }),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('keeps every decision on offer after any other refusal', async () => {
    mockedPost.mockResolvedValueOnce(refused(409, 'already_resolved', 'This dispute was already resolved.'))
    renderModal()
    decide('Move the student')
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This dispute was already resolved.')
    expect(screen.getByText('Resume the case')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument()
  })
})

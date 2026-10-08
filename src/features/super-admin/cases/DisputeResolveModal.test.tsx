import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner decision 56 (2026-10-08): when Support deletes a student's account with a dispute open,
// the deletion closes the dispute itself. Nothing is narrowed here any more: the modal offers its
// three decisions, and a refusal (409 `already_resolved` for a dispute that was closed meanwhile)
// shows the server's sentence.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { api } from '@/api/client'
import type { CaseDispute } from '@/queries/disputes'
import { DisputeResolveModal } from './DisputeResolveModal'

const mockedPost = vi.mocked(api.POST)

const DISPUTE = { id: 'd1', journey_id: 'j1', student_name: 'Meera Pillai', status: 'open' } as unknown as CaseDispute

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

  it('sends the decision and the note, then closes', async () => {
    mockedPost.mockResolvedValueOnce({ data: { ...DISPUTE, status: 'resolved' }, error: undefined } as never)
    renderModal()
    decide('Close the case')
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))

    await waitFor(() =>
      expect(mockedPost).toHaveBeenLastCalledWith('/disputes/{id}/resolve', {
        params: { path: { id: 'd1' } },
        body: { action: 'close', resolution_note: 'Spoke to both sides.' },
      }),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ status: 'resolved' }))
  })

  it('shows the server’s sentence when the dispute was already resolved, and narrows nothing', async () => {
    mockedPost.mockResolvedValueOnce(refused(409, 'already_resolved', 'This dispute was already resolved.'))
    renderModal()
    decide('Move the student')
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This dispute was already resolved.')
    for (const label of ['Resume the case', 'Move the student', 'Close the case']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument()
    expect(screen.queryByText('Close dispute')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not narrow to "Close dispute" on a 409 conflict either: the sentence is shown as it is', async () => {
    mockedPost.mockResolvedValueOnce(refused(409, 'conflict', 'This case cannot be resumed.'))
    renderModal()
    decide('Resume the case')
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This case cannot be resumed.')
    expect(screen.getByText('Move the student')).toBeInTheDocument()
    expect(screen.queryByText('Close dispute')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument()
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// T4-17: a case reopened with no consultant asks who should take it, instead of coming back
// unassigned with no word said.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
const access = vi.hoisted(() => ({ canAssign: true }))
vi.mock('@/lib/permissions', () => ({ usePermission: () => access.canAssign }))
vi.mock('@/components/ServerSearchSelect', () => ({
  ServerSearchSelect: ({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) => (
    <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { ReopenClientModal } from './ReopenClientModal'

function typeReason(text = 'The student came back') {
  fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: text } })
}

function renderModal(assigned: boolean, closingNote: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <ReopenClientModal clientId="c1" clientName="Ishaan Khan" assigned={assigned} closingNote={closingNote} onClose={onClose} />
    </QueryClientProvider>,
  )
  return onClose
}

beforeEach(() => {
  vi.mocked(api.POST).mockReset()
  vi.mocked(api.PATCH).mockReset()
  vi.mocked(showToast).mockClear()
  access.canAssign = true
  vi.mocked(api.POST).mockResolvedValue({ data: { id: 'c1', version: 4 }, error: undefined, response: { status: 200 } } as never)
  vi.mocked(api.PATCH).mockResolvedValue({ data: { id: 'c1' }, error: undefined, response: { status: 200 } } as never)
})

describe('Reopen Case', () => {
  it('closes with a toast when the case already has a consultant', async () => {
    const onClose = renderModal(true)
    typeReason()
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Case' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(showToast).toHaveBeenCalledWith('Case reopened for Ishaan Khan')
  })

  it('asks who should take a case that has none, and assigns them', async () => {
    const onClose = renderModal(false)
    expect(screen.getByText(/No consultant holds this case/)).toBeInTheDocument()
    typeReason()
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Case' }))
    expect(await screen.findByText(/no consultant\s+holds it yet\. Who should take it\?/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Consultant'), { target: { value: 'e9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(vi.mocked(api.PATCH).mock.calls[0][1]).toMatchObject({ body: { assigned_employee_id: 'e9', version: 4 } })
  })

  it('tells someone who cannot assign to ask an admin', async () => {
    access.canAssign = false
    const onClose = renderModal(false)
    typeReason()
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Case' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('ask an admin to assign one'))
  })

  // Phase 8 T2-04: a typed reason of at least 3 characters is required, and is what is sent.
  it('will not reopen without a reason of at least 3 characters, and says what is missing', () => {
    renderModal(true)
    expect(screen.getByRole('button', { name: 'Reopen Case' })).toBeDisabled()
    expect(screen.getByText('Still needed: the reason.')).toBeInTheDocument()
    typeReason('ab')
    expect(screen.getByRole('button', { name: 'Reopen Case' })).toBeDisabled()
    typeReason('  abc  ')
    expect(screen.getByRole('button', { name: 'Reopen Case' })).toBeEnabled()
    expect(screen.queryByText(/Still needed/)).toBeNull()
  })

  it('sends the trimmed reason', async () => {
    const onClose = renderModal(true)
    typeReason('  The student came back  ')
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Case' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(vi.mocked(api.POST).mock.calls[0][1]).toMatchObject({ params: { path: { id: 'c1' } }, body: { reason: 'The student came back' } })
  })

  it('shows the sentence the server refuses with', async () => {
    vi.mocked(api.POST).mockResolvedValue({
      data: undefined,
      error: { error: { code: 'validation_failed', message: 'Say why this case is being reopened.', status: 400 } },
      response: { status: 400 },
    } as never)
    renderModal(true)
    typeReason()
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Case' }))
    expect(await screen.findByText('Say why this case is being reopened.')).toBeInTheDocument()
  })
})

// T4-17: the answer's own `needs_assigning` decides whether to ask who takes the case, and the
// note typed at close is shown beside the reason box.
describe('Reopen Case: the served needs_assigning and the closing note', () => {
  it('asks who takes the case when the answer says nobody holds it, even if a consultant was on it before', async () => {
    vi.mocked(api.POST).mockResolvedValue({
      data: { id: 'c1', version: 5, needs_assigning: true },
      error: undefined,
      response: { status: 200 },
    } as never)
    renderModal(true)
    typeReason()
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Case' }))
    expect(await screen.findByText(/Who should take it\?/)).toBeInTheDocument()
  })

  it('does not ask when the answer says the case is held, even if the page thought nobody held it', async () => {
    vi.mocked(api.POST).mockResolvedValue({
      data: { id: 'c1', version: 5, needs_assigning: false },
      error: undefined,
      response: { status: 200 },
    } as never)
    const onClose = renderModal(false)
    typeReason()
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Case' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(showToast).toHaveBeenCalledWith('Case reopened for Ishaan Khan')
    expect(screen.queryByText(/Who should take it/)).toBeNull()
  })

  it('shows the closing note, exactly as typed, beside the reason box', () => {
    renderModal(true, 'Student chose another city.')
    expect(screen.getByText('Closing note')).toBeInTheDocument()
    expect(screen.getByText('Student chose another city.')).toBeInTheDocument()
  })
})

describe('Reopen Case on a case closed as under 16', () => {
  it("shows the server's refusal as served and stops offering Reopen", async () => {
    const refusal = 'This case was closed because the student is under 16, so it cannot be reopened.'
    vi.mocked(api.POST).mockResolvedValue({
      data: undefined,
      error: { error: { code: 'closed_by_platform', message: refusal, status: 409 } },
      response: { status: 409 },
    } as never)
    renderModal(true)
    typeReason()
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Case' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(refusal)
    expect(screen.getByRole('button', { name: 'Reopen Case' })).toBeDisabled()
  })
})

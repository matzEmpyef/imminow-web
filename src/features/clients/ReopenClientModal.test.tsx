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

function renderModal(assigned: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <ReopenClientModal clientId="c1" clientName="Ishaan Khan" assigned={assigned} onClose={onClose} />
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
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Case' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(showToast).toHaveBeenCalledWith('Case reopened for Ishaan Khan')
  })

  it('asks who should take a case that has none, and assigns them', async () => {
    const onClose = renderModal(false)
    expect(screen.getByText(/No consultant holds this case/)).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Case' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('ask an admin to assign one'))
  })
})

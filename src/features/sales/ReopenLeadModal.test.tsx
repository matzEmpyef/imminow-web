import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Reopen can still be refused for a reason of the moment (the student started a case elsewhere,
// or has too many open chats). The dialog shows the server's sentence as it is.
vi.mock('@/queries/leads', () => ({ useReopenLead: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useReopenLead } from '@/queries/leads'
import { ReopenLeadModal } from './ReopenLeadModal'

const mutate = vi.fn()

beforeEach(() => {
  mutate.mockReset()
})

describe('Reopen Lead dialog', () => {
  it('shows the server’s sentence when the reopen is refused', () => {
    const sentence = 'The student ended this chat, so only they can start it again.'
    vi.mocked(useReopenLead).mockReturnValue({
      mutate,
      isPending: false,
      isError: true,
      error: new ApiError('Could not reopen this lead.', { error: { code: 'conflict', message: sentence } }, 409),
    } as never)
    render(<ReopenLeadModal leadId="l1" leadName="Asha Nair" onClose={vi.fn()} />)
    expect(screen.getByText(sentence)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Reopen Lead' })[0])
    expect(mutate).toHaveBeenCalledWith('l1', expect.anything())
  })
})

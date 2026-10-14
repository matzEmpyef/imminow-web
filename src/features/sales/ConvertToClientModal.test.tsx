import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 8 C-34: the offer to become a client keeps Create Applicant's limits. The two refusals say
// when asking is possible again, and are shown exactly as the server sent them.
vi.mock('@/queries/leads', () => ({ useProposeConversion: vi.fn() }))

import { ApiError } from '@/api/errors'
import { useProposeConversion } from '@/queries/leads'
import { ConvertToClientModal } from './ConvertToClientModal'

const mutate = vi.fn()

beforeEach(() => {
  mutate.mockReset()
})

describe('Convert to Client: the server’s refusals', () => {
  it.each([
    ['request_cooldown', 'You asked this person recently. You can ask again after 12-11-2026.'],
    ['limit_reached', "Your consultancy has reached today's limit for offers to become a client. You can send more tomorrow."],
  ])('shows the %s sentence as served', (code, message) => {
    vi.mocked(useProposeConversion).mockReturnValue({
      mutate,
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new ApiError('Could not send the conversion proposal.', { error: { code, message } }, 409),
    } as never)
    render(<ConvertToClientModal leadId="l1" leadName="Asha Nair" onClose={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(mutate).toHaveBeenCalled()
  })
})

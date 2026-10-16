import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Decision 154: the parent's name follows the name rule (letters of any script, up to 200 in this one
// box), and a refused answer shows the server's own sentence, beside the name when it is about the name.
const state = vi.hoisted(() => ({
  status: 'pending' as 'pending' | 'approved',
  decide: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
  withdraw: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
}))

vi.mock('@/lib/linkToken', () => ({ useLinkToken: () => 'tok' }))
vi.mock('@/lib/useDocumentTitle', () => ({ useDocumentTitle: () => {} }))
vi.mock('@/queries/guardianConsent', () => ({
  useGuardianPrompt: () => ({
    isLoading: false,
    isError: false,
    data: { student_first_name: 'Asha', student_age: 17, status: state.status },
  }),
  useGuardianFreshLink: () => ({ mutate: vi.fn(), isSuccess: false, isError: false }),
  useGuardianDecision: () => state.decide,
  useGuardianWithdraw: () => state.withdraw,
}))

import { ApiError } from '@/api/errors'
import { GuardianApprovalPage } from './GuardianApprovalPage'

function refusal(message: string, fields?: Record<string, string>) {
  return new ApiError('Could not record your answer.', {
    error: { code: 'validation_failed', message, details: fields ? { fields } : undefined },
  })
}

beforeEach(() => {
  state.status = 'pending'
  state.decide = { mutate: vi.fn(), isPending: false, isError: false, error: null }
  state.withdraw = { mutate: vi.fn(), isPending: false, isError: false, error: null }
})

const nameBox = () => screen.getByLabelText(/^Your full name/)

describe('the guardian approval page: the name', () => {
  it('takes a name in an Indian script and sends it trimmed', () => {
    render(<GuardianApprovalPage />)
    fireEvent.change(nameBox(), { target: { value: '  सुनीता  शर्मा ' } })
    fireEvent.click(screen.getByLabelText(/parent or legal guardian/))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(state.decide.mutate).toHaveBeenCalledWith({
      decision: 'approve',
      guardian_name: 'सुनीता शर्मा',
      confirms_adult_guardian: true,
    })
  })

  it('refuses a name with digits in it, with the name sentence', () => {
    render(<GuardianApprovalPage />)
    fireEvent.change(nameBox(), { target: { value: 'Sunita 2' } })
    fireEvent.click(screen.getByLabelText(/parent or legal guardian/))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(state.decide.mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/Use letters, spaces, hyphens, apostrophes and full stops only/)).toBeInTheDocument()
  })

  it('lets one box hold a name of 200 characters, no more', () => {
    render(<GuardianApprovalPage />)
    fireEvent.change(nameBox(), { target: { value: 'a'.repeat(260) } })
    expect((nameBox() as HTMLInputElement).value).toHaveLength(200)
  })
})

describe('the guardian approval page: a refused answer', () => {
  it("shows the server's sentence, not a fixed one", () => {
    state.decide = { ...state.decide, isError: true, error: refusal('This link has already been used.') }
    render(<GuardianApprovalPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('This link has already been used.')
    expect(screen.queryByText('Could not record your answer. Please try again.')).not.toBeInTheDocument()
  })

  it('puts a sentence about the name beside the name, once', () => {
    state.decide = {
      ...state.decide,
      isError: true,
      error: refusal('Check the highlighted fields.', { guardian_name: 'Enter your full name as it is on your ID.' }),
    }
    render(<GuardianApprovalPage />)
    expect(screen.getAllByText('Enter your full name as it is on your ID.')).toHaveLength(1)
    expect(screen.queryByText('Check the highlighted fields.')).not.toBeInTheDocument()
    expect(nameBox()).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows the server’s sentence when withdrawing the approval is refused', () => {
    state.status = 'approved'
    state.withdraw = {
      ...state.withdraw,
      isError: true,
      error: new ApiError('Could not withdraw your approval.', {
        error: { code: 'conflict', message: 'Your approval was already withdrawn.' },
      }),
    }
    render(<GuardianApprovalPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Your approval was already withdrawn.')
  })
})

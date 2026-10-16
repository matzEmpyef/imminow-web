import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// T4-33: a bad limit is answered in the page's own sentence (not the browser's tooltip), and a
// points limit smaller than one award is refused.
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
const mutate = vi.fn()
vi.mock('@/queries/earnRules', () => ({
  useEarnRules: () => ({
    data: [{ id: 'r1', trigger_type: 'quiz_completed', points_value: 10, cap: 50, award_cap: null, cap_period: 'lifetime', lifetime_cap: null, active: true }],
    isLoading: false,
    isError: false,
  }),
  useProfileMilestones: () => ({ data: [] }),
  useUpdateEarnRule: () => ({ mutate, isPending: false, isError: false }),
}))

import { EarnRulesPage } from './EarnRulesPage'

beforeEach(() => mutate.mockClear())

function openEditor() {
  render(<EarnRulesPage />)
  fireEvent.click(screen.getByRole('button', { name: /^Edit / }))
}

describe('Earn Rules limits', () => {
  it('refuses a points limit smaller than one award, in the page’s own sentence', () => {
    openEditor()
    fireEvent.change(screen.getByLabelText('Points limit'), { target: { value: '5' } })
    expect(screen.getByText('The points limit must be at least one award (10 points), or this rule could never pay.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  })

  it('answers a zero or decimal limit with the page’s sentence, not a browser tooltip', () => {
    openEditor()
    fireEvent.change(screen.getByLabelText('Times limit'), { target: { value: '0' } })
    expect(screen.getByText('Enter a whole number from 1 to 10,00,000, or leave it empty for no limit.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  })

  it('saves a sound limit', () => {
    openEditor()
    fireEvent.change(screen.getByLabelText('Points limit'), { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})

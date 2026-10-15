import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner's ruling 2026-10-09: the platform does not assign a student under 18 before their
// guardian has approved. A row the server marks `awaiting_guardian_approval` carries a tag saying
// so and cannot be allocated; if the server still refuses with 409 `guardian_consent_required`,
// its sentence is shown.
vi.mock('@/features/auth/AdminShell', () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/queries/applicantAllocation', () => ({
  useApplicantAllocationQueue: vi.fn(),
  useAllocateApplicant: vi.fn(),
  useAllocationCandidates: vi.fn(),
  useResolveAllocationRequest: vi.fn(),
}))
vi.mock('@/queries/applicantCase', () => ({ useCarryQuestions: () => ({ admission: false, payments: false }) }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/components/SearchSelect', () => ({
  SearchSelect: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange('acc-2')}>
      Pick consultancy
    </button>
  ),
}))

import {
  useAllocateApplicant,
  useAllocationCandidates,
  useApplicantAllocationQueue,
  useResolveAllocationRequest,
} from '@/queries/applicantAllocation'
import { guardianHoldLabel } from '@/lib/guardianGate'
import { ApplicantAllocationPage } from './ApplicantAllocationPage'

function row(name: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `q-${name}`,
    applicant_name: name,
    source: 'freelancer_signup',
    reason: 'freelancer_sourced',
    created_at: '2026-10-07T09:00:00Z',
    guardian_status: 'not_required',
    awaiting_guardian_approval: false,
    ...overrides,
  }
}

function renderQueue(rows: Record<string, unknown>[]) {
  vi.mocked(useApplicantAllocationQueue).mockReturnValue({ data: { items: rows }, isLoading: false, isError: false } as never)
  render(
    <MemoryRouter>
      <ApplicantAllocationPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(useAllocateApplicant).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false, error: null } as never)
  vi.mocked(useAllocationCandidates).mockReturnValue({ data: [], isLoading: false, isError: false } as never)
  vi.mocked(useResolveAllocationRequest).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
})

describe('Applicant Allocation — the guardian gate', () => {
  it('tags a row waiting for the guardian and does not offer Allocate, saying why', () => {
    renderQueue([row('Asha', { guardian_status: 'pending', awaiting_guardian_approval: true })])
    expect(screen.getByText('Waiting for guardian approval')).toBeInTheDocument()
    const allocate = screen.getByRole('button', { name: 'Allocate Asha' })
    expect(allocate).toBeDisabled()
    expect(allocate).toHaveAttribute('title', 'Waiting for guardian approval')
    fireEvent.click(allocate)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says a declined guardian is waiting for a new approval, and words withdrawn and expired plainly', () => {
    renderQueue([
      row('Dev', { guardian_status: 'declined', awaiting_guardian_approval: true }),
      row('Esha', { guardian_status: 'withdrawn', awaiting_guardian_approval: true }),
      row('Farid', { guardian_status: 'expired', awaiting_guardian_approval: true }),
    ])
    expect(screen.getByText('Guardian declined — waiting for a new approval')).toBeInTheDocument()
    expect(screen.getByText('Guardian took their approval back — waiting for a new approval')).toBeInTheDocument()
    expect(screen.getByText('Guardian’s approval link expired — waiting for a new approval')).toBeInTheDocument()
    for (const name of ['Dev', 'Esha', 'Farid']) {
      expect(screen.getByRole('button', { name: `Allocate ${name}` })).toBeDisabled()
    }
  })

  it('leaves adults and approved minors as they were', () => {
    renderQueue([row('Gita'), row('Hari', { guardian_status: 'approved' })])
    expect(screen.queryByText(/guardian/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Allocate Gita' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Allocate Hari' })).toBeEnabled()
  })

  it('shows the server’s sentence when it still answers guardian_consent_required', () => {
    const sentence =
      'This student is under 18 and their guardian has not approved yet. They can be assigned once the guardian approves.'
    vi.mocked(useAllocateApplicant).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: true,
      error: new Error(sentence),
    } as never)
    renderQueue([row('Ira')])
    fireEvent.click(screen.getByRole('button', { name: 'Allocate Ira' }))
    expect(screen.getByText(sentence)).toBeInTheDocument()
  })
})

describe('guardianHoldLabel', () => {
  it('follows the server’s flag, so an unknown status still holds the row', () => {
    expect(guardianHoldLabel({ awaiting_guardian_approval: false, guardian_status: 'pending' })).toBeNull()
    expect(guardianHoldLabel({ awaiting_guardian_approval: true, guardian_status: 'something_new' as never })).toBe(
      'Waiting for guardian approval',
    )
    expect(guardianHoldLabel(undefined)).toBeNull()
  })
})

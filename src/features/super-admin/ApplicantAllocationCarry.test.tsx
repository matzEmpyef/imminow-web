import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Allocating a consultancy-change row moves a case, so the operator chooses what goes with it
// (owner's ruling on review I-014, 2026-10-08). A freelancer referral opens a first case: there
// is nothing to carry, no boxes are shown and no `carry` is sent.
vi.mock('@/features/auth/AdminShell', () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/queries/applicantAllocation', () => ({
  useApplicantAllocationQueue: vi.fn(),
  useAllocateApplicant: vi.fn(),
  useAllocationCandidates: vi.fn(),
  useResolveAllocationRequest: vi.fn(),
}))
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
import { showToast } from '@/lib/toast'
import { ApplicantAllocationPage } from './ApplicantAllocationPage'

const mutate = vi.fn()

const changeRow = {
  id: 'q1',
  applicant_name: 'Asha Nair',
  source: 'complaint',
  reason: 'consultancy_change',
  current_consultancy_name: 'Alpha Consult',
  created_at: '2026-10-07T09:00:00Z',
}
const freelancerRow = {
  id: 'q2',
  applicant_name: 'Zoya Khan',
  source: 'freelancer_signup',
  reason: 'freelancer_sourced',
  freelancer_name: 'Ravi',
  created_at: '2026-10-07T09:00:00Z',
}

function openAllocate(row: Record<string, unknown>) {
  vi.mocked(useApplicantAllocationQueue).mockReturnValue({ data: { items: [row] }, isLoading: false, isError: false } as never)
  render(
    <MemoryRouter>
      <ApplicantAllocationPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: `Allocate ${row.applicant_name as string}` }))
  fireEvent.click(screen.getByRole('button', { name: 'Pick consultancy' }))
}

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(showToast).mockClear()
  vi.mocked(useAllocateApplicant).mockReturnValue({ mutate, isPending: false, isError: false, error: null } as never)
  vi.mocked(useAllocationCandidates).mockReturnValue({ data: [], isLoading: false, isError: false } as never)
  vi.mocked(useResolveAllocationRequest).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
})

describe('Applicant Allocation — what moves with the case', () => {
  it('a consultancy change: shows the boxes, sends all four keys and says what was shared', () => {
    openAllocate(changeRow)
    expect(screen.getByRole('checkbox', { name: /Documents/ })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: /College applications/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Allocate' }))

    expect(mutate.mock.calls[0][0]).toEqual({
      consultancyId: 'acc-2',
      carry: { documents: true, applications: true, preferences: false, chat: false },
    })
    mutate.mock.calls[0][1].onSuccess({ ok: true, client_id: 'n1', carried: ['documents', 'applications'] })
    expect(showToast).toHaveBeenCalledWith('Moved. Shared: documents, college applications.')
  })

  it('a freelancer referral: no boxes, and no carry is sent', () => {
    openAllocate(freelancerRow)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText('What moves with the case')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Allocate' }))

    expect(mutate.mock.calls[0][0]).toEqual({ consultancyId: 'acc-2', carry: undefined })
    mutate.mock.calls[0][1].onSuccess({ ok: true, client_id: 'n2' })
    expect(showToast).toHaveBeenCalledWith('Zoya Khan allocated')
  })
})

import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

// Phase 8 T4-02 and the three newer signal codes: the pending column and the Pending tile show the
// served figures to the paisa, and each signal reads as the server worded it.
vi.mock('@/features/auth/AdminShell', () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../finance/ConsultancySearchSelect', () => ({ ConsultancySearchSelect: () => null }))
vi.mock('@/queries/caseFollowups', () => ({
  useCaseFollowups: vi.fn(),
  useCaseNotes: () => ({ data: [], isLoading: false, isError: false }),
  useRecordFollowup: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))

import { useCaseFollowups } from '@/queries/caseFollowups'
import { CaseFollowupsPage } from '../CaseFollowupsPage'

const signal = (code: string, label: string, detail: string) => ({ code, label, detail, ask_student: false })

describe('Payment follow-ups — pending figures and the new signals', () => {
  it('shows the pending column from each row and the Pending tile from the served total', () => {
    vi.mocked(useCaseFollowups).mockReturnValue({
      data: {
        items: [
          {
            journey_id: 'j1',
            student_name: 'Asha Nair',
            consultancy_name: 'Bright Path',
            followup_count: 0,
            pending_inr: 12345.5,
            amount_at_stake_inr: 99,
            signals: [
              signal(
                'moved_with_acceptance',
                'Moved with an accepted college',
                'immiNow moved this student to another consultancy after a college had accepted them. The first consultancy keeps that admission and its share is still due to immiNow.',
              ),
            ],
          },
          {
            journey_id: 'j2',
            student_name: 'Ravi Kumar',
            consultancy_name: 'Bright Path',
            followup_count: 0,
            pending_inr: 0,
            signals: [
              signal(
                'deleted_during_dispute',
                'Account deleted while a dispute was open',
                'The student’s account was deleted while a dispute was open on this case, so the commission was not settled. Decide what, if anything, is owed to immiNow.',
              ),
              signal(
                'failed_despite_contribution',
                'Failed despite a recorded contribution',
                "A PR case closed as a failure after the applicant's contribution was recorded. Nothing is owed on it now. Worth a word with the applicant.",
              ),
            ],
          },
        ],
        summary: { total: 2, not_called: 2, due_for_call: 0, snoozed: 0, by_signal: {}, pending_inr: 0, pending_total_inr: 12345.5 },
        meta: {},
      },
      isLoading: false,
      isError: false,
    } as never)
    render(
      <MemoryRouter>
        <CaseFollowupsPage />
      </MemoryRouter>,
    )

    // The tile is the served total; the old `pending_inr` of the summary (0 here) is not used.
    expect(screen.getByText('Pending').parentElement).toHaveTextContent('₹12,345.50')
    // The column: the served figure, a dash where nothing is pending (not the amount at stake).
    const rows = screen.getAllByRole('row')
    expect(within(rows.find((r) => r.textContent?.includes('Asha Nair'))!).getByText('₹12,345.50')).toBeInTheDocument()
    expect(within(rows.find((r) => r.textContent?.includes('Ravi Kumar'))!).queryByText(/₹/)).not.toBeInTheDocument()
    // Each of the three codes reads as the server labelled it (the filter list repeats the words, so look in the rows).
    const asha = rows.find((r) => r.textContent?.includes('Asha Nair'))!
    const ravi = rows.find((r) => r.textContent?.includes('Ravi Kumar'))!
    expect(within(asha).getByText('Moved with an accepted college')).toBeInTheDocument()
    expect(within(ravi).getByText('Account deleted while a dispute was open')).toBeInTheDocument()
    expect(within(ravi).getByText('Failed despite a recorded contribution')).toBeInTheDocument()

    // Opening the row shows each served sentence as served.
    fireEvent.click(ravi)
    expect(
      screen.getByText(
        'The student’s account was deleted while a dispute was open on this case, so the commission was not settled. Decide what, if anything, is owed to immiNow.',
      ),
    ).toBeInTheDocument()
  })
})

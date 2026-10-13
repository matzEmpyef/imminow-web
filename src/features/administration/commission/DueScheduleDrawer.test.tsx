import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DueScheduleDrawer } from './DueScheduleDrawer'

// Small-difference settlement (2026-10-08), as the consultancy sees it: a part settled by a
// write-off is shown to a consultancy as closed, never as a write-off (DECISIONS 126(a)).
const part = (overrides: Record<string, unknown> = {}) => ({
  key: 'p1',
  id: null,
  kind: 'calculated',
  source: 'tuition',
  status: 'paid',
  currency: 'CAD',
  amount: 960,
  paid: 960,
  outstanding: 0,
  due_on: '2026-10-01',
  written_off: 0,
  settled: false,
  settled_reason: null,
  settled_by_name: null,
  settled_at: null,
  ...overrides,
})

const due = (parts: Record<string, unknown>[]) =>
  ({ applicant_name: 'Aiko Tanaka', rate_percent: 10, tuition_fee: { amount: 10000, currency: 'CAD' }, due_schedule: parts }) as never

describe('DueScheduleDrawer, a part settled by a write-off', () => {
  it('tells the consultancy only that the part is closed: no write-off figure, no name, no reason', () => {
    render(
      <DueScheduleDrawer
        due={due([
          part({
            written_off: 40,
            settled: true,
            settled_reason: 'Bank charges',
            settled_by_name: 'immiNow Finance',
            settled_at: '2026-10-08T10:00:00Z',
          }),
        ])}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(screen.queryByText('Paid', { selector: 'span' })).toBeNull()
    expect(screen.queryByText(/Written off/i)).toBeNull()
    expect(screen.queryByText(/Bank charges/)).toBeNull()
    expect(screen.queryByText(/Settled/)).toBeNull()
    // What was paid stays the money received.
    expect(screen.getByText(/Paid CAD 960\.00/)).toBeInTheDocument()
  })

  it('shows no Closed mark on a part paid in full', () => {
    render(<DueScheduleDrawer due={due([part()])} onClose={() => {}} />)
    expect(screen.queryByText('Closed')).toBeNull()
    expect(screen.queryByText(/Written off/)).toBeNull()
  })
})

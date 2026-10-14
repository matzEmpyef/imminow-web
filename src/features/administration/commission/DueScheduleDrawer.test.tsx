import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DueScheduleDrawer } from './DueScheduleDrawer'

// Small-difference settlement (2026-10-08), as the consultancy sees it: the server sends each part
// with `amount_state` (open or closed) and no write-off fields (DECISIONS 126(a); owner's ruling
// 2026-10-13), and the drawer shows only Open or Closed.
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
  amount_state: 'closed',
  ...overrides,
})

const due = (parts: Record<string, unknown>[]) =>
  ({ applicant_name: 'Aiko Tanaka', rate_percent: 10, tuition_fee: { amount: 10000, currency: 'CAD' }, due_schedule: parts }) as never

describe('DueScheduleDrawer, a part settled by a write-off', () => {
  it('tells the consultancy only that the part is closed: no write-off figure, no name, no reason', () => {
    render(
      <DueScheduleDrawer
        due={due([
          part({ amount_state: 'closed' }),
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

  it('shows Open, beside the part’s own status, on a part still asked for', () => {
    render(
      <DueScheduleDrawer due={due([part({ status: 'overdue', paid: 0, outstanding: 960, amount_state: 'open' })])} onClose={() => {}} />,
    )
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.queryByText('Closed')).toBeNull()
    expect(screen.queryByText(/Written off/)).toBeNull()
  })
})

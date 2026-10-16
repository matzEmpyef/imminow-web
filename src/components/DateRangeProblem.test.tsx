import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DateRangeProblem } from './DateRangeProblem'
import { AuditDateRange } from '@/features/administration/AuditDateRange'

// Decision 154, ruling 7: every end date is on or after its start, and any date is 1900 to 2100.
describe('DateRangeProblem', () => {
  it('says nothing for a pair in order, or while one side is empty', () => {
    const { container, rerender } = render(<DateRangeProblem from="2026-10-01" to="2026-10-01" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<DateRangeProblem from="" to="2026-10-01" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<DateRangeProblem from="2026-10-01" to="" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says the end must be on or after the start', () => {
    render(<DateRangeProblem from="2026-10-02" to="2026-10-01" />)
    expect(screen.getByRole('alert')).toHaveTextContent('The end date must be on or after the start date.')
  })
})

describe('the audit log date range', () => {
  it('bounds both dates to 1900-2100 and narrows each by the other', () => {
    render(<AuditDateRange from="2026-10-01" to="2026-10-20" onFromChange={() => {}} onToChange={() => {}} />)
    const from = screen.getByLabelText('From')
    const to = screen.getByLabelText('To')
    expect(from).toHaveAttribute('min', '1900-01-01')
    expect(from).toHaveAttribute('max', '2026-10-20')
    expect(to).toHaveAttribute('min', '2026-10-01')
    expect(to).toHaveAttribute('max', '2100-12-31')
  })

  it('names the problem when the end is before the start', () => {
    render(<AuditDateRange from="2026-10-20" to="2026-10-01" onFromChange={() => {}} onToChange={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('The end date must be on or after the start date.')
  })
})

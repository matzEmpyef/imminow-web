import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IntakeStatusBadge } from './IntakeStatusBadge'

// Read-only wording of the server-derived intake status (product owner, 2026-09-24).
describe('IntakeStatusBadge', () => {
  it('shows an open intake with the date it is open until', () => {
    render(<IntakeStatusBadge status="open" deadline="2027-03-31" />)
    expect(screen.getByText('Open until 31/03/2027')).toBeInTheDocument()
  })

  it('shows a passed deadline and a missing one in words', () => {
    const { rerender } = render(<IntakeStatusBadge status="closed" deadline="2026-01-15" />)
    expect(screen.getByText('Deadline passed')).toBeInTheDocument()

    rerender(<IntakeStatusBadge status="unknown" deadline={null} />)
    expect(screen.getByText('No deadline')).toBeInTheDocument()
  })

  it('shows a dash, not a guess, when the server sent no status', () => {
    render(<IntakeStatusBadge status={undefined} deadline="2027-03-31" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

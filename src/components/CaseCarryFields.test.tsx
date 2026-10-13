import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CARRY, type CaseCarry } from '@/lib/caseCarry'
import { CaseCarryFields } from './CaseCarryFields'

// The same four tick boxes in Transfer Applicant, Switch consultancy and Applicant Allocation
// (owner's ruling on review I-014, 2026-10-08).
function Harness({ onValue, askAdmission }: { onValue: (value: CaseCarry) => void; askAdmission?: boolean }) {
  const [value, setValue] = useState(DEFAULT_CARRY)
  onValue(value)
  return <CaseCarryFields value={value} onChange={setValue} askAdmission={askAdmission} />
}

describe('CaseCarryFields', () => {
  it('offers the four choices with documents ticked, and says what never moves', () => {
    render(<Harness onValue={() => {}} />)
    expect(screen.getByText('Choose what the new consultancy receives. The student is told what was shared.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Documents — the documents the student has shared/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /College applications — applications already made, with their status/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Case preferences — chosen country and how the student pays/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Earlier conversation — the chat with the previous consultancy, read-only/ })).not.toBeChecked()
    expect(screen.getByText('The plan, internal notes and commission records never move.')).toBeInTheDocument()
  })

  it('keeps all four keys as boxes are ticked and unticked', () => {
    let latest: CaseCarry = DEFAULT_CARRY
    render(<Harness onValue={(value) => (latest = value)} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Earlier conversation/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Documents/ }))
    expect(latest).toEqual({ documents: false, applications: false, preferences: false, chat: true, admission: false })
  })

  it('asks about the admission only when told a college has accepted the student', () => {
    const { rerender } = render(<Harness onValue={() => {}} />)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    rerender(<Harness onValue={() => {}} askAdmission />)
    expect(screen.getByText('Does the admission go to the new consultancy too?')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked()
    expect(
      screen.getByText(
        "If not, the accepted college stays with the first consultancy and immiNow's share of that admission becomes due from it now.",
      ),
    ).toBeInTheDocument()
  })

  it('keeps the answer as Yes and No are chosen', () => {
    let latest: CaseCarry = DEFAULT_CARRY
    render(<Harness onValue={(value) => (latest = value)} askAdmission />)
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(latest.admission).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    expect(latest.admission).toBe(false)
  })
})

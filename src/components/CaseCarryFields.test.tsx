import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CARRY, type CaseCarry } from '@/lib/caseCarry'
import { CaseCarryFields } from './CaseCarryFields'

// The same four tick boxes in Transfer Applicant, Switch consultancy and Applicant Allocation
// (owner's ruling on review I-014, 2026-10-08).
function Harness({
  onValue,
  askAdmission,
  askPayments,
}: {
  onValue: (value: CaseCarry) => void
  askAdmission?: boolean
  askPayments?: boolean
}) {
  const [value, setValue] = useState(DEFAULT_CARRY)
  onValue(value)
  return <CaseCarryFields value={value} onChange={setValue} askAdmission={askAdmission} askPayments={askPayments} />
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
    expect(latest).toEqual({ documents: false, applications: false, preferences: false, chat: true, admission: false, recorded_payments: false })
  })

  it('asks about the admission only when told a college has accepted the student', () => {
    const { rerender } = render(<Harness onValue={() => {}} />)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    rerender(<Harness onValue={() => {}} askAdmission />)
    expect(screen.getByText('Does the admission go to the new consultancy too?')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked()
    expect(screen.getByText("The accepted college stays with the first consultancy, and immiNow's share of that admission becomes due from it now.")).toBeInTheDocument()
  })

  it('keeps the answer as Yes and No are chosen', () => {
    let latest: CaseCarry = DEFAULT_CARRY
    render(<Harness onValue={(value) => (latest = value)} askAdmission />)
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(latest.admission).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    expect(latest.admission).toBe(false)
  })

  it('explains each answer to the admission question', () => {
    render(<Harness onValue={() => {}} askAdmission />)
    expect(screen.getByText("The accepted college stays with the first consultancy, and immiNow's share of that admission becomes due from it now.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(screen.getByText('The new consultancy takes over the accepted college and its commission from now on.')).toBeInTheDocument()
    expect(screen.queryByText("The accepted college stays with the first consultancy, and immiNow's share of that admission becomes due from it now.")).not.toBeInTheDocument()
  })

  it('asks about the recorded money only after Yes to the admission, with No chosen and the explanation', () => {
    let latest: CaseCarry = DEFAULT_CARRY
    render(<Harness onValue={(value) => (latest = value)} askAdmission askPayments />)
    expect(screen.queryByText('Does the money already recorded on this admission go too?')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('radio', { name: 'Yes' })[0])
    expect(screen.getByText('Does the money already recorded on this admission go too?')).toBeInTheDocument()
    expect(screen.getByText("If yes, the payments already recorded move to the new consultancy, and it owes immiNow's share on all of them. If no, the first consultancy still owes the share on what it has already received.")).toBeInTheDocument()
    const payments = within(screen.getByRole('radiogroup', { name: 'Does the money already recorded on this admission go too?' }))
    expect(payments.getByRole('radio', { name: 'No' })).toBeChecked()
    expect(payments.getByRole('radio', { name: 'No' })).toBeRequired()
    expect(latest.recorded_payments).toBe(false)
    fireEvent.click(payments.getByRole('radio', { name: 'Yes' }))
    expect(latest).toMatchObject({ admission: true, recorded_payments: true })
  })

  it('takes the money answer back to No, and hides the question, when the admission goes back to No', () => {
    let latest: CaseCarry = DEFAULT_CARRY
    render(<Harness onValue={(value) => (latest = value)} askAdmission askPayments />)
    const admission = within(screen.getByRole('radiogroup', { name: 'Does the admission go to the new consultancy too?' }))
    fireEvent.click(admission.getByRole('radio', { name: 'Yes' }))
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Does the money already recorded on this admission go too?' })).getByRole('radio', { name: 'Yes' }))
    expect(latest.recorded_payments).toBe(true)
    fireEvent.click(admission.getByRole('radio', { name: 'No' }))
    expect(latest).toMatchObject({ admission: false, recorded_payments: false })
    expect(screen.queryByText('Does the money already recorded on this admission go too?')).not.toBeInTheDocument()
  })

  it('does not ask the money question when only the admission is asked', () => {
    render(<Harness onValue={() => {}} askAdmission />)
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(screen.queryByText('Does the money already recorded on this admission go too?')).not.toBeInTheDocument()
  })
})

import { describe, expect, it } from 'vitest'
import { auditActionLabel } from './auditActions'

// The three audit actions of the money-correctness round (2026-10-08) have their own words in
// both audit logs.
describe('auditActionLabel', () => {
  it('names the three new money actions', () => {
    expect(auditActionLabel('installment_void_requested')).toBe('Installment Void Requested')
    expect(auditActionLabel('installment_void_declined')).toBe('Installment Void Declined')
    expect(auditActionLabel('due_settled')).toBe('Due Marked Fully Paid')
  })

  it('has nothing for an action that is simply title-cased', () => {
    expect(auditActionLabel('create')).toBeUndefined()
    expect(auditActionLabel('payment_confirmed')).toBeUndefined()
  })
})

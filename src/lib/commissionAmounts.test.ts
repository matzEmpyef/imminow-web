import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import {
  admissionAmountMessage,
  admissionCommissionBody,
  admissionRefusal,
  commissionBody,
  defaultCourseStart,
  emptyAmounts,
  stillNeeded,
  stillNeededLine,
  type CommissionAmounts,
} from './commissionAmounts'

const filled: CommissionAmounts = {
  collegeAmount: '1200.50',
  collegeCurrency: 'GBP',
  studentAmount: '',
  studentCurrency: '',
  startMonth: 'September',
  startYear: 2027,
}

describe('the amounts of a moved admission', () => {
  it('lists everything missing from an empty form', () => {
    expect(stillNeededLine(emptyAmounts())).toBe('Still needed: an amount from the college or the student, the month the course starts.')
  })

  it('needs only one amount, and the currency of any amount that was typed', () => {
    expect(stillNeeded(filled)).toEqual([])
    expect(stillNeededLine(filled)).toBeNull()
    expect(stillNeeded({ ...filled, collegeCurrency: '' })).toEqual(['the currency of the college amount'])
    expect(stillNeeded({ ...filled, collegeAmount: '', studentAmount: '90', studentCurrency: '' })).toEqual([
      'the currency of the student amount',
    ])
  })

  it('refuses an amount that is not above zero or has a third decimal', () => {
    expect(stillNeeded({ ...filled, collegeAmount: '0' })).toEqual(['a valid amount from the college'])
    expect(stillNeeded({ ...filled, collegeAmount: '10.123' })).toEqual(['a valid amount from the college'])
    expect(stillNeeded({ ...filled, collegeAmount: '10.120' })).toEqual([])
  })

  it('sends only the sides that were filled in, with the course start', () => {
    expect(admissionCommissionBody(filled)).toEqual({
      expected_from_college: { amount: 1200.5, currency: 'GBP' },
      course_start: { month: 'September', year: 2027 },
    })
    expect(admissionCommissionBody({ ...filled, studentAmount: '300', studentCurrency: 'INR' })).toEqual({
      expected_from_college: { amount: 1200.5, currency: 'GBP' },
      expected_from_student: { amount: 300, currency: 'INR' },
      course_start: { month: 'September', year: 2027 },
    })
  })

  it("locks the college side to the course's own fee currency when it has one", () => {
    expect(commissionBody(filled, { college: true, student: false }, 'CAD').expected_from_college).toEqual({ amount: 1200.5, currency: 'CAD' })
  })

  it('offers the course start the Accept popup offers', () => {
    expect(defaultCourseStart(null)).toEqual({ month: '', year: new Date().getFullYear() })
    expect(defaultCourseStart({ next_intake: { month: 'May', application_deadline: '2027-01-31' } } as never)).toEqual({ month: 'May', year: 2027 })
    expect(defaultCourseStart({ next_intake: { month: 'January', application_deadline: '2027-03-31' } } as never)).toEqual({ month: 'January', year: 2028 })
    expect(defaultCourseStart({ next_intake: { month: 'September', application_deadline: '2027-01-31' } } as never)).toEqual({ month: 'September', year: 2027 })
  })
})

describe('the served refusals of a moved admission', () => {
  const message = 'Enter the amounts agreed with Beta Consult for this admission.'
  const body = (code: string, fields?: Record<string, string>) => ({ error: { code, message, details: fields ? { fields } : undefined } })

  it('reads the sentence the server put against admission_commission', () => {
    expect(admissionRefusal(new ApiError('x', body('validation_failed', { admission_commission: message }), 422))).toBe(message)
  })

  it('reads not_a_partner_college and admission_cannot_move even without a field', () => {
    expect(admissionRefusal(new ApiError('x', body('not_a_partner_college'), 409))).toBe(message)
    expect(admissionRefusal(new ApiError('x', body('admission_cannot_move'), 409))).toBe(message)
  })

  it('leaves any other failure to the form footer', () => {
    expect(admissionRefusal(new ApiError('x', body('no_active_staff'), 409))).toBeUndefined()
    expect(admissionRefusal(null)).toBeUndefined()
  })

  it('finds the sentence for one amount when the server names it', () => {
    const error = new ApiError('x', body('validation_failed', { 'admission_commission.expected_from_college.amount': 'Amounts have at most two decimal places.' }), 422)
    expect(admissionAmountMessage(error, 'college')).toBe('Amounts have at most two decimal places.')
    expect(admissionAmountMessage(error, 'student')).toBeUndefined()
  })
})

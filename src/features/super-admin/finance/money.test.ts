import { describe, expect, it } from 'vitest'
import { toCsv } from '@/lib/csv'
import type { CommissionPayment } from '@/queries/commission'
import { paymentAmount, paymentInrAmount, paymentInrNote, paymentMoney, paymentsTotalLabel } from './money'
import { PAYMENT_HISTORY_COLUMNS } from './paymentHistoryCsv'

// Assumptions audit M15 (product owner, 2026-09-19). Two separate defects, both invisible on
// screen because the numbers looked exact: a received amount rounded to whole units, and a
// cross-currency settlement re-converted at today's rate on every read.
describe('paymentAmount', () => {
  it('reads minor units, so the paise are not lost', () => {
    expect(paymentAmount({ amount: { amount: 1241, currency: 'CAD' }, amount_minor: 124060, currency_exponent: 2 })).toBe(
      1240.6,
    )
  })

  it('honours a currency with no minor unit at all', () => {
    expect(paymentAmount({ amount: { amount: 5000, currency: 'JPY' }, amount_minor: 5000, currency_exponent: 0 })).toBe(5000)
  })

  it('honours a three-decimal currency', () => {
    expect(paymentAmount({ amount: { amount: 12, currency: 'KWD' }, amount_minor: 12500, currency_exponent: 3 })).toBe(12.5)
  })

  it('falls back to the major-unit figure on a row written before minor units were stored', () => {
    expect(paymentAmount({ amount: { amount: 1241, currency: 'CAD' } })).toBe(1241)
  })

  it('is undefined when there is no amount at all', () => {
    expect(paymentAmount(undefined)).toBeUndefined()
    expect(paymentAmount({ amount: { amount: null, currency: 'CAD' } })).toBeUndefined()
  })
})

describe('paymentMoney', () => {
  it('formats INR with the symbol and Indian grouping', () => {
    expect(paymentMoney({ amount: { amount: 0, currency: 'INR' }, amount_minor: 350000000, currency_exponent: 2 })).toBe(
      '₹35,00,000',
    )
  })

  it('renders a dash rather than a zero for a missing amount', () => {
    expect(paymentMoney({ amount: { amount: null, currency: 'CAD' } })).toBe('—')
  })
})

describe('paymentInrNote', () => {
  it('shows the rate the settlement was valued at, and when that rate was set', () => {
    expect(
      paymentInrNote({
        amount: { amount: 1240.6, currency: 'CAD' },
        amount_inr: 103218,
        rate_used: 83.2,
        rate_as_of: '2026-09-12T10:00:00Z',
      }),
    ).toBe('≈ ₹1,03,218 at 83.2, rate of 12 Sep')
  })

  it('shows the ≈ figure alone on a row written before the rate was stored, never inventing one', () => {
    expect(paymentInrNote({ amount: { amount: 1240, currency: 'CAD' }, amount_inr: 103168 })).toBe('≈ ₹1,03,168')
  })

  it('says nothing for an INR payment — there is nothing to convert', () => {
    expect(paymentInrNote({ amount: { amount: 5000, currency: 'INR' }, amount_inr: 5000, rate_used: 1 })).toBeNull()
  })

  it('says nothing when the rupee value is not known', () => {
    expect(paymentInrNote({ amount: { amount: 1240, currency: 'CAD' } })).toBeNull()
    expect(paymentInrNote(null)).toBeNull()
  })
})

// Review F-158: the payment history export printed each payment's own-currency amount under
// "Amount INR". Finance reconciles from this file.
describe('the payment history export', () => {
  const cad = {
    id: 'p1',
    status: 'confirmed',
    amount: { amount: 1241, currency: 'CAD' },
    amount_minor: 124060,
    currency_exponent: 2,
    amount_inr: 76123,
    consultancy_name: 'Alpha Consult',
    applicant_name: 'Asha Nair',
    transaction_id: 'TXN-1',
    recorded_at: '2026-09-01',
    confirmed_at: '2026-09-03',
    confirmed_by_name: 'Finance One',
  } as unknown as CommissionPayment
  const inrPayment = {
    id: 'p2',
    status: 'rejected',
    amount: { amount: 5000, currency: 'INR' },
    amount_inr: null,
    consultancy_name: 'Beta, Abroad',
    applicant_name: null,
    recorded_at: '2026-09-02',
    rejected_at: '2026-09-04',
    rejected_by_name: 'Finance Two',
    reject_reason: 'Not received',
  } as unknown as CommissionPayment

  const [header, first, second] = toCsv([cad, inrPayment], PAYMENT_HISTORY_COLUMNS).split('\r\n')

  it('has currency, amount and rupee amount as three columns', () => {
    expect(header).toBe('Date,Status,Currency,Amount,Amount INR,Consultancy,Student,Reference,Declared,Confirmed/Rejected,By,Reason')
  })

  it('puts a CAD payment in CAD, exact to the cent, with its rupee value beside it', () => {
    expect(first).toBe('03/09/2026,confirmed,CAD,1240.6,76123,Alpha Consult,Asha Nair,TXN-1,01/09/2026,03/09/2026,Finance One,')
  })

  it('gives a rupee payment the same figure in both amount columns', () => {
    expect(second).toBe('04/09/2026,rejected,INR,5000,5000,"Beta, Abroad",General,,02/09/2026,04/09/2026,Finance Two,Not received')
  })

  it('leaves the rupee column empty, rather than guess, when a foreign payment has no stored equivalent', () => {
    expect(paymentInrAmount({ amount: { amount: 100, currency: 'USD' }, amount_inr: null })).toBeUndefined()
    expect(paymentInrAmount({ amount: { amount: 100, currency: 'USD' }, amount_inr: 8300 })).toBe(8300)
    expect(paymentInrAmount({ amount: { amount: 100, currency: 'INR' } })).toBe(100)
  })
})

// Review F-159: the bulk-confirm button and the dialog it opens must state the same total.
describe('paymentsTotalLabel', () => {
  const cad = { amount: { amount: 1000, currency: 'CAD' }, amount_inr: 83000 }
  const inr = { amount: { amount: 5000, currency: 'INR' }, amount_inr: null }

  it('totals one currency in that currency', () => {
    expect(paymentsTotalLabel([inr, { amount: { amount: 1000, currency: 'INR' } }])).toBe('₹6,000')
    expect(paymentsTotalLabel([cad, { amount: { amount: 1400, currency: 'CAD' }, amount_inr: 116200 }])).toBe(
      'CAD 2,400',
    )
  })

  it('never adds different currencies together: a mixed selection is totalled in rupee values, and says so', () => {
    // CAD 1,000 + INR 5,000 used to read "₹6,000" on the button.
    expect(paymentsTotalLabel([cad, inr])).toBe('≈ ₹88,000 (mixed currencies)')
  })

  it('treats a payment with no currency as rupees', () => {
    expect(paymentsTotalLabel([{ amount: { amount: 250 } }])).toBe('₹250')
  })
})

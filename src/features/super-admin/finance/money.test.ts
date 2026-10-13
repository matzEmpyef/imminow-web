import { describe, expect, it } from 'vitest'
import { toCsv } from '@/lib/csv'
import type { CommissionPayment } from '@/queries/commission'
import {
  money,
  paymentAmount,
  paymentInrAmount,
  paymentInrNote,
  paymentMoney,
  paymentSettlesNote,
  paymentsTotalLabel,
} from './money'
import { PAYMENT_HISTORY_COLUMNS } from './paymentHistoryCsv'

// Assumptions audit M15 (product owner, 2026-09-19). Two separate defects, both invisible on
// screen because the numbers looked exact: a received amount rounded to whole units, and a
// cross-currency settlement re-converted at today's rate on every read.
describe('paymentAmount', () => {
  it('reads minor units, so the paise are not lost', () => {
    expect(
      paymentAmount({ amount: { amount: 1241, currency: 'CAD' }, amount_minor: 124060, currency_exponent: 2 }),
    ).toBe(1240.6)
  })

  it('honours a currency with no minor unit at all', () => {
    expect(paymentAmount({ amount: { amount: 5000, currency: 'JPY' }, amount_minor: 5000, currency_exponent: 0 })).toBe(
      5000,
    )
  })

  it('honours a three-decimal currency', () => {
    expect(paymentAmount({ amount: { amount: 12, currency: 'KWD' }, amount_minor: 12500, currency_exponent: 3 })).toBe(
      12.5,
    )
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
    expect(
      paymentMoney({ amount: { amount: 0, currency: 'INR' }, amount_minor: 350000000, currency_exponent: 2 }),
    ).toBe('₹35,00,000.00')
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
    ).toBe('≈ ₹1,03,218.00 at 83.2, rate of 12 Sep')
  })

  it('shows the ≈ figure alone on a row written before the rate was stored, never inventing one', () => {
    expect(paymentInrNote({ amount: { amount: 1240, currency: 'CAD' }, amount_inr: 103168 })).toBe('≈ ₹1,03,168.00')
  })

  it('says nothing for an INR payment — there is nothing to convert', () => {
    expect(paymentInrNote({ amount: { amount: 5000, currency: 'INR' }, amount_inr: 5000, rate_used: 1 })).toBeNull()
  })

  it('says nothing when the rupee value is not known', () => {
    expect(paymentInrNote({ amount: { amount: 1240, currency: 'CAD' } })).toBeNull()
    expect(paymentInrNote(null)).toBeNull()
  })
})

// Review F-158 and Phase 8 T4-04 to T4-06: Finance reconciles from this file, so it is written from
// the strings the server serves for each payment (`export`), exactly as they come.
describe('the payment history export', () => {
  const cad = {
    id: 'p1',
    export: {
      date: '03-09-2026',
      status: 'Confirmed',
      currency: 'CAD',
      amount: '1240.60',
      amount_inr: '76123.00',
      account: 'Alpha Consult',
      applicant: 'Asha Nair',
      reference: 'TXN-1',
      declared_on: '01-09-2026',
      decided_on: '03-09-2026',
      decided_by: 'Finance One',
      reason: 'Declared as CAD 1,241.00: bank fee | Corrected on 04-09-2026 from CAD 1,241.00 to CAD 1,240.60: the bank sent the amount',
      settled_in: '',
      rate_used: '61.3',
      amount_settled: '',
    },
    // The screen's own figures are different on purpose: the file does not read them.
    amount: { amount: 1, currency: 'CAD' },
    status: 'confirmed',
  } as unknown as CommissionPayment
  const inrPayment = {
    id: 'p2',
    export: {
      date: '04-09-2026',
      status: 'Rejected',
      currency: 'INR',
      amount: '5000.00',
      amount_inr: '5000.00',
      account: 'Beta, Abroad',
      applicant: '',
      reference: '',
      declared_on: '02-09-2026',
      decided_on: '04-09-2026',
      decided_by: 'Finance Two',
      reason: 'Not received',
      settled_in: '',
      rate_used: '1',
      amount_settled: '',
    },
  } as unknown as CommissionPayment

  const [header, first, second] = toCsv([cad, inrPayment], PAYMENT_HISTORY_COLUMNS).split('\r\n')

  it('has the same columns, in the same order, as before', () => {
    expect(header).toBe(
      'Date,Status,Currency,Amount,Amount INR,Consultancy,Student,Reference,Declared,Confirmed/Rejected,By,Reason,Settled in,Rate used,Amount settled',
    )
  })

  it('writes each cell as the server wrote it: two decimals, DD-MM-YYYY, the typed reasons', () => {
    expect(first).toBe(
      '03-09-2026,Confirmed,CAD,1240.60,76123.00,Alpha Consult,Asha Nair,TXN-1,01-09-2026,03-09-2026,Finance One,"Declared as CAD 1,241.00: bank fee | Corrected on 04-09-2026 from CAD 1,241.00 to CAD 1,240.60: the bank sent the amount",,61.3,',
    )
  })

  it('quotes a cell that has a comma, and leaves an empty cell empty', () => {
    expect(second).toBe('04-09-2026,Rejected,INR,5000.00,5000.00,"Beta, Abroad",,,02-09-2026,04-09-2026,Finance Two,Not received,,1,')
  })

  it('writes what a payment in another currency settled, as served', () => {
    const usd = {
      id: 'p3',
      export: { ...cad.export!, currency: 'USD', amount: '1000.00', settled_in: 'CAD', rate_used: '1.4', amount_settled: '1400.00' },
    } as unknown as CommissionPayment
    const [, row] = toCsv([usd], PAYMENT_HISTORY_COLUMNS).split('\r\n')
    expect(row.endsWith(',CAD,1.4,1400.00')).toBe(true)
  })

  it('leaves every cell empty for a row that carries no export line, rather than guess', () => {
    const [, row] = toCsv([{ id: 'p4' } as unknown as CommissionPayment], PAYMENT_HISTORY_COLUMNS).split('\r\n')
    expect(row).toBe(',,,,,,,,,,,,,,')
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
    expect(paymentsTotalLabel([inr, { amount: { amount: 1000, currency: 'INR' } }])).toBe('₹6,000.00')
    expect(paymentsTotalLabel([cad, { amount: { amount: 1400, currency: 'CAD' }, amount_inr: 116200 }])).toBe(
      'CAD 2,400.00',
    )
  })

  it('never adds different currencies together: a mixed selection is totalled in rupee values, and says so', () => {
    // CAD 1,000 + INR 5,000 used to read "₹6,000" on the button.
    expect(paymentsTotalLabel([cad, inr])).toBe('≈ ₹88,000.00 (mixed currencies)')
  })

  it('treats a payment with no currency as rupees', () => {
    expect(paymentsTotalLabel([{ amount: { amount: 250 } }])).toBe('₹250.00')
  })
})

// Review F-079: a payment Finance recorded in another currency than the one owed says what it
// settled, from the three facts the server froze on it.
describe('paymentSettlesNote', () => {
  it('says what it settled and at what rate', () => {
    expect(
      paymentSettlesNote({
        amount: { amount: 1000, currency: 'USD' },
        settles_currency: 'CAD',
        settles_rate: 1.4,
        settled: { amount: 1400, currency: 'CAD' },
      }),
    ).toBe('Settled CAD 1,400.00 of the CAD dues · 1 USD = 1.4 CAD')
  })

  it('writes rupee dues with the symbol', () => {
    expect(
      paymentSettlesNote({
        amount: { amount: 100, currency: 'USD' },
        settles_currency: 'INR',
        settles_rate: 84,
        settled: { amount: 8400, currency: 'INR' },
      }),
    ).toBe('Settled ₹8,400.00 of the INR dues · 1 USD = 84 INR')
  })

  it('is nothing on a payment in the currency owed', () => {
    expect(paymentSettlesNote({ amount: { amount: 1000, currency: 'CAD' }, settles_currency: null })).toBeNull()
    expect(paymentSettlesNote({ amount: { amount: 1000, currency: 'CAD' } })).toBeNull()
    expect(paymentSettlesNote(undefined)).toBeNull()
  })
})

describe('rates read at most six decimals (Phase 8 T1-04)', () => {
  it('shortens a long stored rate in the payment note', () => {
    expect(
      paymentInrNote({
        amount: { amount: 1240, currency: 'CAD' },
        amount_inr: 103168,
        rate_used: 83.19999999999999,
        rate_as_of: '2026-09-12T10:00:00Z',
      }),
    ).toBe('≈ ₹1,03,168.00 at 83.2, rate of 12 Sep')
  })

  it('shortens a long settlement rate', () => {
    expect(
      paymentSettlesNote({
        amount: { amount: 1000, currency: 'USD' },
        settles_currency: 'CAD',
        settles_rate: 1.4000000000000001,
        settled: { amount: 1400, currency: 'CAD' },
      }),
    ).toBe('Settled CAD 1,400.00 of the CAD dues · 1 USD = 1.4 CAD')
  })

  it('writes a small negative rupee amount with the sign first', () => {
    expect(money({ amount: -0.12, currency: 'INR' })).toBe('-₹0.12')
  })
})

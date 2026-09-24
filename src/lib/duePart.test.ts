import { describe, expect, it } from 'vitest'
import { duePartDueDateText, duePartLabel, type DuePartMoneyFormatter } from './duePart'
import { formatMoneyAmount } from './money'
import { money as financeMoney } from '@/features/super-admin/finance/money'
import type { components } from '@/api/schema'

type Part = components['schemas']['CommissionDuePart']

const part = (p: Partial<Part>) => p as Part

describe('duePartLabel', () => {
  it('names an unset rate as "rate not set", never "0% share" (approved 2026-09-19)', () => {
    expect(duePartLabel(part({ source: 'student' }), null, null, formatMoneyAmount)).toBe("Student's fee — rate not set")
    expect(duePartLabel(part({ source: 'student' }), undefined, null, financeMoney)).toBe("Student's fee — rate not set")
    expect(duePartLabel(part({ source: 'student' }), 0, null, financeMoney)).toBe("Student's fee — 0% share")
    expect(duePartLabel(part({ source: 'student' }), 25, null, financeMoney)).toBe("Student's fee — 25% share")
  })

  it('writes money in the caller\'s own format — Finance "₹", the consultancy "INR"', () => {
    const tuition = part({ source: 'tuition' })
    const fee = { amount: 350000, currency: 'INR' }
    expect(duePartLabel(tuition, 10, fee, financeMoney)).toBe('Tuition — 10% share of ₹3,50,000')
    expect(duePartLabel(tuition, 10, fee, formatMoneyAmount)).toBe('Tuition — 10% share of INR 3,50,000')
    expect(duePartLabel(tuition, null, { amount: 32000, currency: 'CAD' }, financeMoney)).toBe(
      'Tuition — rate not set of CAD 32,000',
    )
  })

  it('leaves "of …" off a tuition part with no tuition fee rather than printing a zero', () => {
    expect(duePartLabel(part({ source: 'tuition' }), 10, null, financeMoney)).toBe('Tuition — 10% share')
  })

  it('passes the instalment amount to the formatter it was given', () => {
    const seen: unknown[] = []
    const spy: DuePartMoneyFormatter = (m) => {
      seen.push(m)
      return 'X'
    }
    const label = duePartLabel(
      part({ source: 'college_instalment', instalment_amount: { amount: 5, currency: 'CAD' } }),
      10,
      null,
      spy,
    )
    expect(label).toMatch(/^College instalment of X received /)
    expect(seen).toEqual([{ amount: 5, currency: 'CAD' }])
  })

  it('labels override and added parts by their reason', () => {
    expect(duePartLabel(part({ kind: 'override', reason: 'Waiver' }), 10, null, financeMoney)).toBe('Override — Waiver')
    expect(duePartLabel(part({ kind: 'added' }), 10, null, financeMoney)).toBe('Added — no reason given')
  })
})

describe('duePartDueDateText', () => {
  it('names the event an undated part waits on', () => {
    expect(duePartDueDateText(part({ source: 'college_expected' }))).toBe('When the college pays')
    expect(duePartDueDateText(part({ source: 'student_instalment' }))).toBe('When the student pays')
    expect(duePartDueDateText(part({ source: 'tuition' }))).toBe('When the case closes')
  })
})

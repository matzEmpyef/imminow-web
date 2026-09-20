import { describe, expect, it } from 'vitest'
import { humaniseCode, labelFor } from './humanise'
import { formatScore, scoreSchemeSuffix } from './scoreScheme'

// Assumptions audit M34 (product owner, 2026-09-19): the console's hand-kept enum copies all
// resolved a miss by falling through to a NEIGHBOURING entry, which is how a paid account came
// to read "Subscription · No term".
describe('humaniseCode', () => {
  it('reads an unknown code as itself, tidied', () => {
    expect(humaniseCode('pending_review')).toBe('Pending review')
    expect(humaniseCode('trial-extended')).toBe('Trial extended')
    expect(humaniseCode('lapsed')).toBe('Lapsed')
  })

  it('leaves nothing to render when there is no code', () => {
    expect(humaniseCode('')).toBe('')
    expect(humaniseCode('   ')).toBe('')
  })
})

describe('labelFor', () => {
  const labels = { full_time: 'Full time' }

  it('prefers the known label', () => {
    expect(labelFor(labels, 'full_time')).toBe('Full time')
  })

  it('never borrows another entry for an unknown value', () => {
    expect(labelFor(labels, 'block_release')).toBe('Block release')
  })
})

// Assumptions audit M38: "8.5" was indistinguishable from "8.5 %", and a score with no scheme at
// all was printed as a percentage.
describe('score schemes', () => {
  it('names the scale beside every score', () => {
    expect(formatScore(8.5, 'cgpa_10')).toBe('8.5 CGPA / 10')
    expect(formatScore(3.4, 'cgpa_4')).toBe('3.4 CGPA / 4')
    expect(formatScore(78, 'percentage')).toBe('78%')
  })

  it('says so rather than assuming a percentage when the scheme is missing', () => {
    expect(formatScore(8.5, null)).toBe('8.5 (scale not recorded)')
    expect(scoreSchemeSuffix(null)).toBe('')
  })

  it('names an unrecognised scheme instead of printing no unit', () => {
    expect(scoreSchemeSuffix('cgpa_7')).toBe(' Cgpa 7')
  })

  it('has nothing to print with no score', () => {
    expect(formatScore(null, 'percentage')).toBeNull()
  })
})

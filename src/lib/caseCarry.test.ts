import { describe, expect, it } from 'vitest'
import { carriedOverLine, carryForSend, carryQuestions, DEFAULT_CARRY, movedSentence } from './caseCarry'

// Owner's ruling on review I-014 (2026-10-08): the person moving a case decides what goes with it.
describe('what moves with a case', () => {
  it('starts with the documents only', () => {
    expect(DEFAULT_CARRY).toEqual({
      documents: true,
      applications: false,
      preferences: false,
      chat: false,
      admission: false,
      recorded_payments: false,
    })
  })

  it('tells the person who made the move what the server shared', () => {
    expect(movedSentence(['documents', 'applications'])).toBe('Moved. Shared: documents, college applications.')
    expect(movedSentence(['preferences', 'chat'])).toBe('Moved. Shared: case preferences, earlier conversation.')
    expect(movedSentence(['documents', 'admission'])).toBe('Moved. Shared: documents, accepted college.')
    expect(movedSentence(['documents', 'admission', 'recorded_payments'])).toBe(
      'Moved. Shared: documents, accepted college, recorded payments.',
    )
    expect(movedSentence([])).toBe('Moved. Nothing was shared.')
    expect(movedSentence(undefined)).toBe('Moved. Nothing was shared.')
  })

  it('tells the receiving consultancy what came with the case, and nothing for a case that started there', () => {
    expect(carriedOverLine(['documents', 'applications'])).toBe('Carried over: documents, college applications')
    expect(carriedOverLine([])).toBe('Carried over: nothing')
    expect(carriedOverLine(null)).toBeNull()
    expect(carriedOverLine(undefined)).toBeNull()
  })
})

// The move forms ask from the flags the server serves on their own read (DECISIONS 117 C-9, 145e, 146).
describe('which questions a move asks', () => {
  it('asks nothing without an accepted college, whatever the money flag says', () => {
    expect(carryQuestions({ has_accepted_college: false, has_recorded_payments: true })).toEqual({ admission: false, payments: false })
    expect(carryQuestions({ has_recorded_payments: true })).toEqual({ admission: false, payments: false })
    expect(carryQuestions(undefined)).toEqual({ admission: false, payments: false })
  })

  it('asks the admission question for an accepted college, and the money question only when money is recorded', () => {
    expect(carryQuestions({ has_accepted_college: true, has_recorded_payments: false })).toEqual({ admission: true, payments: false })
    expect(carryQuestions({ has_accepted_college: true })).toEqual({ admission: true, payments: false })
    expect(carryQuestions({ has_accepted_college: true, has_recorded_payments: true })).toEqual({ admission: true, payments: true })
  })
})

describe('what is sent', () => {
  it('sends recorded_payments only together with the admission', () => {
    expect(carryForSend({ ...DEFAULT_CARRY, admission: false, recorded_payments: true }).recorded_payments).toBe(false)
    expect(carryForSend({ ...DEFAULT_CARRY, admission: true, recorded_payments: true })).toMatchObject({ admission: true, recorded_payments: true })
    expect(carryForSend({ ...DEFAULT_CARRY, admission: true, recorded_payments: false }).recorded_payments).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { carriedOverLine, DEFAULT_CARRY, movedSentence } from './caseCarry'

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

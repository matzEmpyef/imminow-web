import { describe, expect, it } from 'vitest'
import { LOCAL_PHONE_REGION, phoneError, phoneToSend } from './validation'
import { dialCodeFor, phoneRegionOf } from './phoneRegion'

// A staff phone typed without a country code is read in the consultancy's own country.
describe('the region a local phone is read in', () => {
  it('is the calling code of the consultancy’s country', () => {
    expect(dialCodeFor('India')).toBe('91')
    expect(dialCodeFor(' united kingdom ')).toBe('44')
    expect(phoneRegionOf('Canada')).toBe('1')
  })

  it('is "the server reads it" for a country this console has no code for, and nothing without a country', () => {
    expect(phoneRegionOf('Atlantis')).toBe(LOCAL_PHONE_REGION)
    expect(phoneRegionOf('')).toBeUndefined()
    expect(phoneRegionOf(null)).toBeUndefined()
  })

  it('lets a local number of 6 to 15 digits through for a country with no known code, as typed', () => {
    expect(phoneError('0123 456 789', LOCAL_PHONE_REGION)).toBeUndefined()
    expect(phoneToSend('0123 456 789', LOCAL_PHONE_REGION)).toBe('0123456789')
    expect(phoneError('123', LOCAL_PHONE_REGION)).toBeDefined()
  })

  it('reads a UK number in the UK and an Indian one in India', () => {
    expect(phoneToSend('07911 123456', '44')).toBe('+447911123456')
    expect(phoneToSend('98765 43210', '91')).toBe('+919876543210')
  })
})

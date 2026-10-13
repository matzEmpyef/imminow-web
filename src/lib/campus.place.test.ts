import { describe, expect, it } from 'vitest'
import { collegePlaceLine } from './campus'

// T4-19: colleges with near-identical names are told apart by where they are.
describe('collegePlaceLine', () => {
  it('lists the cities, then the country', () => {
    expect(
      collegePlaceLine({ campuses: [{ city: 'Dublin' }, { city: 'Cork' }, { city: 'Dublin' }], countries: ['Ireland'] }),
    ).toBe('Dublin, Cork · Ireland')
  })

  it('shortens a long list of cities', () => {
    const campuses = ['A', 'B', 'C', 'D', 'E'].map((city) => ({ city }))
    expect(collegePlaceLine({ campuses, countries: ['Canada'] })).toBe('A, B, C and 2 more · Canada')
  })

  it('falls back to the campus country, and to nothing', () => {
    expect(collegePlaceLine({ campuses: [{ city: 'Leeds', country: 'United Kingdom' }] })).toBe('Leeds · United Kingdom')
    expect(collegePlaceLine({})).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { campusLabel } from './campus'

const unnamed = { name: null, city: 'Toronto', province_state: 'Ontario', country: 'Canada' }
const named = { ...unnamed, name: 'Toronto Downtown' }

describe('campusLabel', () => {
  it('shows the name when there is one', () => {
    expect(campusLabel(named)).toBe('Toronto Downtown')
  })

  it('shows the city when there is no name, whether null, missing or blank', () => {
    expect(campusLabel(unnamed)).toBe('Toronto')
    expect(campusLabel({ city: 'Toronto', province_state: 'Ontario', country: 'Canada' })).toBe('Toronto')
    expect(campusLabel({ ...unnamed, name: '   ' })).toBe('Toronto')
  })

  it('falls back to province, then country, never to nothing', () => {
    expect(campusLabel({ city: null, province_state: 'Ontario', country: 'Canada' })).toBe('Ontario')
    expect(campusLabel({ city: ' ', province_state: '', country: 'Canada' })).toBe('Canada')
  })

  it('trims the name', () => {
    expect(campusLabel({ ...unnamed, name: '  Toronto Downtown ' })).toBe('Toronto Downtown')
  })

  it('adds the place for pickers: named after the name, unnamed as the full place', () => {
    expect(campusLabel(named, { withPlace: true })).toBe('Toronto Downtown — Toronto, Ontario, Canada')
    expect(campusLabel(unnamed, { withPlace: true })).toBe('Toronto, Ontario, Canada')
    expect(campusLabel({ name: 'Main', country: '' }, { withPlace: true })).toBe('Main')
  })
})

import { describe, expect, it } from 'vitest'
import { campusLabel, courseCampusLabel } from './campus'

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

  it('uses the label the server sent, whatever the rest of the object says', () => {
    expect(campusLabel({ ...named, label: 'Toronto Downtown' })).toBe('Toronto Downtown')
    expect(campusLabel({ ...unnamed, label: 'Toronto' })).toBe('Toronto')
    expect(campusLabel({ ...unnamed, label: 'Server says so' })).toBe('Server says so')
    expect(campusLabel({ ...named, label: 'Toronto Downtown' }, { withPlace: true })).toBe(
      'Toronto Downtown — Toronto, Ontario, Canada',
    )
    expect(campusLabel({ ...unnamed, label: 'Toronto' }, { withPlace: true })).toBe('Toronto, Ontario, Canada')
  })

  it('ignores a blank label and applies the rule itself', () => {
    expect(campusLabel({ ...named, label: '  ' })).toBe('Toronto Downtown')
    expect(campusLabel({ ...unnamed, label: null })).toBe('Toronto')
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

describe('courseCampusLabel', () => {
  it('shows the served campus_label when there is one', () => {
    expect(courseCampusLabel({ campus_label: 'Toronto Downtown', campus_city: 'Toronto' })).toBe('Toronto Downtown')
  })

  it('falls back to campus_city when the label is missing, null or blank', () => {
    expect(courseCampusLabel({ campus_city: 'Toronto' })).toBe('Toronto')
    expect(courseCampusLabel({ campus_label: null, campus_city: 'Toronto' })).toBe('Toronto')
    expect(courseCampusLabel({ campus_label: '  ', campus_city: 'Toronto' })).toBe('Toronto')
  })

  it('is an empty string when the course has neither', () => {
    expect(courseCampusLabel({})).toBe('')
    expect(courseCampusLabel({ campus_label: null, campus_city: null })).toBe('')
  })
})

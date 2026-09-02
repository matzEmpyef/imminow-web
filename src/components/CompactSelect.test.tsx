import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CompactSelect } from './CompactSelect'

// The accessible name is mandatory precisely because these selects live where there is no room
// for a visible label; the audit found hand-rolled predecessors that had forgotten it.
describe('CompactSelect', () => {
  it('always carries the accessible name it was given', () => {
    render(
      <CompactSelect label="Journey stage" value="" onChange={() => {}}>
        <option value="">Any stage</option>
      </CompactSelect>,
    )
    expect(screen.getByRole('combobox', { name: 'Journey stage' })).toBeInTheDocument()
  })

  it('switches to table-cell density without stacking a second height class', () => {
    render(
      <CompactSelect label="Default currency for India" dense value="INR" onChange={() => {}} className="w-24">
        <option value="INR">INR</option>
      </CompactSelect>,
    )
    const el = screen.getByRole('combobox', { name: 'Default currency for India' })
    expect(el).toHaveClass('h-8')
    expect(el).not.toHaveClass('h-10')
    expect(el).toHaveClass('w-24')
  })
})

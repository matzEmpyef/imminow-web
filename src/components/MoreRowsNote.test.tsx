import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { MoreRowsNote } from './MoreRowsNote'

// Review F-298: a list that fetches one page and has no pager must say so.
describe('MoreRowsNote', () => {
  it('says nothing while the list is complete', () => {
    const { container } = render(<MoreRowsNote shown={12} total={12} hasMore={false} noun="cases" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says how many of the total are shown, with a link to the full list', () => {
    render(
      <MemoryRouter>
        <MoreRowsNote shown={50} total={130} noun="cases" to="/admin/finance-dashboard?tab=cases" linkLabel="Search all cases" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('note')).toHaveTextContent('Showing the first 50 of 130 cases.')
    expect(screen.getByRole('link', { name: 'Search all cases' })).toHaveAttribute(
      'href',
      '/admin/finance-dashboard?tab=cases',
    )
  })

  it('still says there are more when the response has a next page but no total', () => {
    render(<MoreRowsNote shown={20} hasMore noun="courses" hint="Search to see the rest." />)
    expect(screen.getByRole('note')).toHaveTextContent('Showing the first 20 courses. Search to see the rest.')
  })
})

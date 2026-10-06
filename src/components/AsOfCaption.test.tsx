import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AsOfCaption } from './AsOfCaption'

// Review F-161: the caption on every rollup dashboard. Fresh figures read as before; figures from
// another day carry their date; figures older than two refreshes are shown as a warning.
describe('AsOfCaption', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 6, 10, 30))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads as it always did for figures from this hour', () => {
    render(<AsOfCaption asOf={new Date(2026, 9, 6, 10, 0).toISOString()} note="Queues are live." />)
    expect(screen.getByText('Figures as of 10:00, refreshed hourly. Queues are live.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('warns, with the date, when the figures are three days old', () => {
    render(<AsOfCaption asOf={new Date(2026, 9, 3, 14, 0).toISOString()} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Figures as of 14:00 on 03/10/2026. These are older than expected: the hourly refresh may be delayed.',
    )
  })

  it('warns for figures from earlier today that are more than two refreshes old', () => {
    render(<AsOfCaption asOf={new Date(2026, 9, 6, 7, 0).toISOString()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Figures as of 07:00. These are older than expected')
  })

  it('shows the date on a page that always wants it, without a warning when fresh', () => {
    render(<AsOfCaption asOf={new Date(2026, 9, 6, 10, 0).toISOString()} dated />)
    expect(screen.getByText('Figures as of 10:00 on 06/10/2026, refreshed hourly.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows nothing when the response carries no stamp', () => {
    const { container } = render(<AsOfCaption asOf={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

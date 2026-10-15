import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

// T4-34: the League shows the server's wording of a median response time ("119 days 6 hours"), and
// the console's own wording (lib/duration.ts) for a row the server sent no text for.
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/queries/adminConsultancies', () => ({ useAdminConsultancies: () => ({ data: { items: [] } }) }))
vi.mock('@/queries/performanceLeague', () => ({
  usePerformanceLeague: () => ({
    isLoading: false,
    isError: false,
    data: {
      as_of: '2026-10-13T00:00:00Z',
      thresholds: { response_target_percent: 80, slow_response_hours: 24, low_conversion_percent: 10 },
      items: [
        {
          consultancy_id: 'c1',
          consultancy_name: 'Served Advisors',
          leads_received: 6,
          responded_within_percent: 50,
          response_time_median_hours: 2862,
          response_time_median_text: '119 days 6 hours',
          conversion_rate_percent: null,
          flags: { slow_response: false, low_conversion: false },
        },
        {
          consultancy_id: 'c2',
          consultancy_name: 'Plain Advisors',
          leads_received: 6,
          responded_within_percent: 50,
          response_time_median_hours: 25,
          conversion_rate_percent: null,
          flags: { slow_response: false, low_conversion: false },
        },
      ],
    },
  }),
}))

import { PerformanceLeaguePage } from './PerformanceLeaguePage'

describe('Performance League: median response time', () => {
  it('reads the served text, and falls back to the console’s own days-and-hours wording', () => {
    render(
      <MemoryRouter>
        <PerformanceLeaguePage />
      </MemoryRouter>,
    )
    expect(screen.getByText('median 119 days 6 hours')).toBeInTheDocument()
    expect(screen.getByText('median 25 hours')).toBeInTheDocument()
    expect(screen.queryByText(/median 1d/)).not.toBeInTheDocument()
  })
})

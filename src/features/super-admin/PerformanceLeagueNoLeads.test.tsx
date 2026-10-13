import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

// T4-34: an account that received no leads in the window has nothing to judge, so it is never
// flagged "Below 80%".
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
          consultancy_name: 'Quiet Advisors',
          leads_received: 0,
          responded_within_percent: 0,
          response_time_median_hours: null,
          conversion_rate_percent: null,
          flags: { slow_response: true, low_conversion: false },
        },
      ],
    },
  }),
}))

import { PerformanceLeaguePage } from './PerformanceLeaguePage'

describe('Performance League', () => {
  it('says "Nothing to judge yet" for an account with no leads, not "Below 80%"', () => {
    render(
      <MemoryRouter>
        <PerformanceLeaguePage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Quiet Advisors')).toBeInTheDocument()
    expect(screen.getByText('Nothing to judge yet')).toBeInTheDocument()
    expect(screen.queryByText(/Below 80%/)).not.toBeInTheDocument()
  })
})

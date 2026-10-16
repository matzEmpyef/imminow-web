import type { ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Phase 8 C-19: the page shows the searches that found nothing as filters only (no person), and a
// country nobody serves reads "No one serves this yet".
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/DoughnutChart', () => ({ DoughnutChart: () => <div /> }))
vi.mock('@/components/MonthlyBarChart', () => ({ MonthlyBarChart: () => <div /> }))
const setup = vi.hoisted(() => ({ superAdmin: false, save: { mutate: () => {}, isPending: false, isError: false, error: null } as unknown }))
vi.mock('@/lib/me', () => ({ useIsSuperAdmin: () => setup.superAdmin, usePlatformPermission: () => false }))
vi.mock('@/queries/catalogSettings', () => ({ useUpdatePlatformSettings: () => setup.save }))
vi.mock('@/queries/supplyDemand', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/supplyDemand')>()),
  useSupplyDemand: vi.fn(),
}))

import { useSupplyDemand } from '@/queries/supplyDemand'
import { SupplyDemandPage } from './SupplyDemandPage'

const BASE = {
  as_of: null,
  collecting_since: '2026-01-01T00:00:00Z',
  supply_summary: { countries_without_coverage: 1, seat_usage: { used: 4, limit: 10, pct: 40 } },
  destination_split: {
    abroad_only: 1,
    home_only: 0,
    both: 0,
    no_target_country: 0,
    not_onboarded: 0,
    residence_not_set: 0,
    total_students: 1,
  },
  students_with_country_choice: 1,
  students_with_field_choice: 1,
  demand_by_country: [],
  demand_by_country_others: { countries: 0, student_count: 0 },
  demand_by_field: [],
  demand_by_field_others: { fields: 0, student_count: 0 },
  applicant_destinations: {
    current_applicants: 0,
    applying_cases: 0,
    no_application_yet: 0,
    rows: [],
    others: { countries: 0, applying: 0, accepted: 0, enrolled: 0, pct_of_applicants: 0 },
    pr_cases: { in_progress: 0, enrolled: 0 },
  },
  new_students_by_destination: { months: [], series: [] },
  coverage_by_country: {
    cases_per_staff: 20,
    rows: [
      {
        country: 'Germany',
        students_wanting: 5,
        consultancies_serving: 0,
        institutes_serving: 0,
        open_applicants: 0,
        capacity: 0,
        coverage: 'none',
      },
    ],
    others: { countries: 0, no_coverage: 0, limited: 0 },
  },
}

function serve(extra: Record<string, unknown>) {
  vi.mocked(useSupplyDemand).mockReturnValue({
    isLoading: false,
    isError: false,
    data: { ...BASE, ...extra },
    refetch: vi.fn(),
  } as never)
}

describe('Supply & Demand: searches that found nothing', () => {
  it('shows the count and the filter combinations, and nothing about a person', () => {
    serve({
      no_match_searches: {
        days: 30,
        total: 12,
        top: [
          {
            filters: { country: 'Germany', level: 'Master' },
            typed_words: true,
            searches: 7,
            last_searched_at: '2026-10-12T09:00:00Z',
          },
        ],
      },
    })
    render(<SupplyDemandPage />)
    const heading = screen.getByRole('heading', { name: 'Searches that found nothing' })
    const card = heading.parentElement!
    expect(within(card).getByText(/In the last 30 days, students ran 12 course searches that found no course\./)).toBeInTheDocument()
    expect(within(card).getByText('Country: Germany')).toBeInTheDocument()
    expect(within(card).getByText('Level: Master')).toBeInTheDocument()
    expect(within(card).getByText('12-10-2026')).toBeInTheDocument()
  })

  it('draws no block when the answer does not carry it', () => {
    serve({})
    render(<SupplyDemandPage />)
    expect(screen.queryByRole('heading', { name: 'Searches that found nothing' })).not.toBeInTheDocument()
  })

  it('reads coverage "none" as "No one serves this yet"', () => {
    serve({})
    render(<SupplyDemandPage />)
    expect(within(screen.getByText('Germany').closest('tr')!).getByText('No one serves this yet')).toBeInTheDocument()
    expect(screen.queryByText('No coverage')).not.toBeInTheDocument()
  })
})

// Decision 154, ruling 14: a refused save shows the server's own sentence, not "Could not save".
describe('Supply & Demand: the capacity assumption', () => {
  it("shows the server's sentence when the new capacity is refused", () => {
    setup.superAdmin = true
    setup.save = {
      mutate: () => {},
      isPending: false,
      isError: true,
      error: new Error('Capacity must be between 1 and 500 for every country.'),
    }
    serve({})
    render(<SupplyDemandPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Capacity must be between 1 and 500 for every country.')
    expect(screen.queryByText('Could not save — try again.')).not.toBeInTheDocument()
    setup.superAdmin = false
  })
})

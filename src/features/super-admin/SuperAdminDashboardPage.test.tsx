import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-268: the page is open to every platform account, the money is not. For staff without
// the Finance permission the four money fields arrive null, and their cards and chart are left
// out altogether: no zero, no empty frame.
vi.mock('@/features/auth/AdminShell', () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/queries/adminDashboard', () => ({ useAdminDashboard: vi.fn() }))
vi.mock('@/lib/me', () => ({ usePlatformPermission: vi.fn() }))
vi.mock('@/components/DoughnutChart', () => ({ DoughnutChart: () => <div /> }))
vi.mock('@/components/MonthlyBarChart', () => ({ MonthlyBarChart: () => <div /> }))

import { usePlatformPermission } from '@/lib/me'
import { useAdminDashboard } from '@/queries/adminDashboard'
import { SuperAdminDashboardPage } from './SuperAdminDashboardPage'

const base = {
  as_of: '2026-10-08T09:00:00Z',
  stat_cards: [{ key: 'study_abroad_students', label: 'Study Abroad Students', value: 12 }],
  registrations_over_time: [],
  applicant_stage_breakdown: [],
  completed_cases_over_time: [],
}

const money = {
  revenue_snapshot: { amount: 125000, currency: 'INR' },
  revenue_trend: { this_month: 5000, last_month: 4000 },
  dues_outstanding: { amount: 30000, currency: 'INR' },
  revenue_over_time: [{ month: '2026-09', consultancy: 100, institute: 50 }],
}

const noMoney = { revenue_snapshot: null, revenue_trend: null, dues_outstanding: null, revenue_over_time: null }

function show(data: Record<string, unknown>) {
  vi.mocked(useAdminDashboard).mockReturnValue({ data, isLoading: false, isError: false } as never)
  render(
    <MemoryRouter>
      <SuperAdminDashboardPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(usePlatformPermission).mockReturnValue(true)
})

describe('Platform Dashboard — the money', () => {
  it('shows the revenue and dues cards and the revenue chart to someone who is sent them', () => {
    show({ ...base, ...money })
    expect(screen.getByText('Revenue Snapshot')).toBeInTheDocument()
    expect(screen.getByText('Dues Outstanding')).toBeInTheDocument()
    expect(screen.getByText('Confirmed Revenue by Month')).toBeInTheDocument()
    expect(screen.getByText('Completed Cases by Month')).toBeInTheDocument()
  })

  it('leaves them out entirely when the server sends none of it, and keeps the rest of the page', () => {
    show({ ...base, ...noMoney })
    expect(screen.queryByText('Revenue Snapshot')).not.toBeInTheDocument()
    expect(screen.queryByText('Dues Outstanding')).not.toBeInTheDocument()
    expect(screen.queryByText('Confirmed Revenue by Month')).not.toBeInTheDocument()
    expect(screen.queryByText(/this month/)).not.toBeInTheDocument()
    // Nothing is drawn as a zero in their place.
    expect(screen.queryByText(/INR/)).not.toBeInTheDocument()
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument()
    expect(screen.getByText('Study Abroad Students')).toBeInTheDocument()
    expect(screen.getByText('Completed Cases by Month')).toBeInTheDocument()
  })
})

// Review I-047: Supply & Demand opens only with `consultancy_approval`, so the card that leads
// there is a plain figure for anyone else.
describe('Platform Dashboard — the card that opens Supply & Demand', () => {
  const card = () => screen.getByText('Study Abroad Students').closest('div')

  it('is a link for someone who can open the page', () => {
    show({ ...base, ...noMoney })
    expect(card()).toHaveClass('cursor-pointer')
  })

  it('is a plain figure for someone who cannot', () => {
    vi.mocked(usePlatformPermission).mockReturnValue(false)
    show({ ...base, ...noMoney })
    expect(card()).not.toHaveClass('cursor-pointer')
    expect(vi.mocked(usePlatformPermission)).toHaveBeenCalledWith('consultancy_approval')
  })
})

// A median in days reads with a space and agrees with the count: "40 days", "1 day".
describe('Platform Dashboard — a card measured in days', () => {
  it('puts a space before the unit', () => {
    show({
      ...base,
      ...noMoney,
      stat_cards: [{ key: 'median_days_to_enrol', label: 'Median Time to Enrol', value: 40, unit: 'days' }],
    })
    expect(screen.getByText('40 days')).toBeInTheDocument()
    expect(screen.queryByText(/40days/)).not.toBeInTheDocument()
  })

  it('says "1 day" for one day', () => {
    show({
      ...base,
      ...noMoney,
      stat_cards: [{ key: 'median_days_to_enrol', label: 'Median Time to Enrol', value: 1, unit: 'days' }],
    })
    expect(screen.getByText('1 day')).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// T4-31: a featured pick reads as the server names it (`featured_labels`), not as its long id; a
// pick the server could not find reads "No longer available".
const fetchById = vi.hoisted(() => vi.fn())
const settings = vi.hoisted(() => ({ data: undefined as unknown }))
vi.mock('@/queries/pickerSources', () => ({
  consultancySource: () => ({ queryKey: ['consultancies'], fetchById, search: vi.fn(), toOption: vi.fn() }),
}))
vi.mock('@/components/ServerSearchSelect', () => ({ ServerSearchSelect: () => <div>Search</div> }))
vi.mock('@/queries/jobsAdmin', () => ({ useAdminJobs: () => ({ data: { items: [] }, isLoading: false, isError: false }) }))
vi.mock('@/queries/catalogSettings', () => ({
  usePlatformSettings: () => ({ data: settings.data, isLoading: false, isError: false }),
  useUpdatePlatformSettings: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { FeaturedConsultanciesCard, FeaturedJobsCard } from './FeaturedAccountsCard'
import { featuredLabelOf } from '@/lib/servedTier4Fields'

const A = '018f6f3e-d1d2-7e1f-8a1b-000000000001'
const GONE = '018f6f3e-d1d2-7e1f-8a1b-000000000002'

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

beforeEach(() => {
  fetchById.mockReset()
  settings.data = {
    featured_consultancies: [A, GONE],
    featured_jobs: [GONE],
    featured_labels: { [A]: 'Northstar Advisors', [GONE]: 'No longer available' },
  }
})

describe('App Config: featured picks', () => {
  it('shows the served names, and "No longer available" where the record is gone, never the ids', () => {
    wrap(<FeaturedConsultanciesCard />)
    expect(screen.getByText('Northstar Advisors')).toBeInTheDocument()
    expect(screen.getByText('No longer available')).toBeInTheDocument()
    expect(screen.queryByText(A)).not.toBeInTheDocument()
    expect(screen.queryByText(GONE)).not.toBeInTheDocument()
    // Nothing has to be looked up by id when the server named every pick.
    expect(fetchById).not.toHaveBeenCalled()
  })

  it('reads the served label for a job pick too', () => {
    wrap(<FeaturedJobsCard />)
    expect(screen.getByText('No longer available')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove No longer available' })).toBeInTheDocument()
  })

  it('falls back to looking the pick up by id when the read carries no labels', () => {
    settings.data = { featured_consultancies: [A] }
    fetchById.mockResolvedValue({ id: A, name: 'x' })
    wrap(<FeaturedConsultanciesCard />)
    expect(fetchById).toHaveBeenCalledTimes(1)
  })
})

describe('featuredLabelOf', () => {
  it('names an id the map has, and nothing for any other', () => {
    expect(featuredLabelOf({ featured_labels: { a: 'Alpha' } }, 'a')).toBe('Alpha')
    expect(featuredLabelOf({ featured_labels: { a: 'Alpha' } }, 'b')).toBeNull()
    expect(featuredLabelOf({ featured_labels: { a: '' } }, 'a')).toBeNull()
    expect(featuredLabelOf({}, 'a')).toBeNull()
    expect(featuredLabelOf(undefined, 'a')).toBeNull()
  })
})

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

// Where a consultancy sees its own ratings, and where the platform sees a review's signals
// (owner decision 16, review F-012). The consultancy's number counts each STUDENT once; the bars
// plot those ratings; and with too few ratings for a score it says "Not rated yet" without ever
// saying how many it takes.
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/queries/consultancyReviews', () => ({ useMyReviews: vi.fn() }))
vi.mock('@/queries/adminReviews', () => ({ useModerateReview: vi.fn() }))

import { useMyReviews } from '@/queries/consultancyReviews'
import { useModerateReview, type Review } from '@/queries/adminReviews'
import { ConsultancyReviewsPage } from './ConsultancyReviewsPage'
import { ReviewDrawer } from '@/features/super-admin/ReviewDrawer'

function summaryOf(summary: Record<string, unknown>, items: unknown[] = []) {
  vi.mocked(useMyReviews).mockReturnValue({
    data: { summary, items, total: items.length },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never)
}

describe('the consultancy Reviews page', () => {
  it('reads "{rating} from {n} students · {n} written reviews"', () => {
    summaryOf({ rating: 4.26, rating_count: 13, review_count: 3, distribution: { '5': 6, '4': 5, '3': 2 } })
    render(<ConsultancyReviewsPage />)
    expect(screen.getByText('4.3')).toBeInTheDocument()
    expect(screen.getByText('from 13 students · 3 written reviews')).toBeInTheDocument()
  })

  it('uses the singular for one student and one review', () => {
    summaryOf({ rating: 5, rating_count: 1, review_count: 1, distribution: { '5': 1 } })
    render(<ConsultancyReviewsPage />)
    expect(screen.getByText('from 1 student · 1 written review')).toBeInTheDocument()
  })

  it.each([0, 1, 2])('says "Not rated yet" when there is no score with %i ratings, and no reason why', (count) => {
    summaryOf({ rating: null, rating_count: count, review_count: 0, distribution: count ? { '5': count } : {} })
    const { container } = render(<ConsultancyReviewsPage />)
    expect(screen.getByText('Not rated yet')).toBeInTheDocument()
    expect(screen.getByText(`from ${count} ${count === 1 ? 'student' : 'students'} · 0 written reviews`)).toBeInTheDocument()
    // Nothing says how many ratings a score takes.
    expect(container.textContent).not.toMatch(/at least|minimum|need|more rating/i)
  })

  it('titles the bars "Ratings by star" and plots them against the students who rated', () => {
    summaryOf({ rating: 4, rating_count: 4, review_count: 1, distribution: { '5': 1, '4': 2, '3': 1 } })
    const { container } = render(<ConsultancyReviewsPage />)
    expect(screen.getByText('Ratings by star')).toBeInTheDocument()
    expect(screen.getByText('Each student counts once; written reviews show that student’s rating.')).toBeInTheDocument()
    const widths = [...container.querySelectorAll<HTMLElement>('.bg-warning.rounded-full')].map((bar) => bar.style.width)
    // 5★ 1 of 4, 4★ 2 of 4, 3★ 1 of 4, then none.
    expect(widths).toEqual(['25%', '50%', '25%', '0%', '0%'])
  })

  it('explains how ratings and reviews are collected, with no number for "enough"', () => {
    summaryOf({ rating: 4, rating_count: 4, review_count: 1, distribution: {} })
    render(<ConsultancyReviewsPage />)
    const intro = screen.getByText(/Students rate you from their chat once you have talked enough/)
    expect(intro).toHaveTextContent('Each student counts once.')
    expect(intro.textContent).not.toMatch(/\d/)
  })

  it('shows a dash for a published review whose rating is gone', () => {
    summaryOf({ rating: 4, rating_count: 3, review_count: 1, distribution: {} }, [
      { id: 'r1', student_name: 'Former student', stars: null, text: 'Helpful throughout.', created_at: '2026-10-01T09:00:00Z' },
    ])
    render(<ConsultancyReviewsPage />)
    expect(screen.getByText('Helpful throughout.')).toBeInTheDocument()
  })
})

describe('the platform review drawer', () => {
  function review(overrides: Partial<Review> = {}): Review {
    return {
      id: 'review-1',
      consultancy_id: 'cons-1',
      consultancy_name: 'Bright Path',
      journey_id: 'journey-1',
      student_id: 'student-1',
      student_name: 'Meera Pillai',
      study_level: 'masters',
      target_country: 'Canada',
      stars: 5,
      text: 'Guided me at every step.',
      status: 'pending',
      created_at: '2026-10-05T10:00:00Z',
      acquisition_source: 'B',
      flags: ['account_new'],
      rating_id: 'rating-1',
      case_age_days: 2,
      ...overrides,
    }
  }

  function renderDrawer(value: Review) {
    vi.mocked(useModerateReview).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
    render(
      <MemoryRouter>
        <ReviewDrawer review={value} onClose={() => {}} onUpdated={() => {}} />
      </MemoryRouter>,
    )
    return screen.getByRole('dialog', { name: value.student_name })
  }

  it('shows the channel, the signals, how long the case ran, and a link to the rating', () => {
    const drawer = renderDrawer(review())
    expect(drawer).toHaveTextContent('Signals')
    expect(drawer).toHaveTextContent('New account')
    expect(drawer).toHaveTextContent('Channel B · case lasted 2 days')
    expect(screen.getByRole('link', { name: 'Open rating' })).toHaveAttribute(
      'href',
      '/admin/ratings?student_id=student-1',
    )
  })

  it('says "None." when there are no signals and offers no rating link without a rating', () => {
    const drawer = renderDrawer(review({ flags: [], acquisition_source: null, case_age_days: null, rating_id: null }))
    expect(drawer).toHaveTextContent('None.')
    expect(screen.queryByRole('link', { name: 'Open rating' })).not.toBeInTheDocument()
  })

  it('uses the singular for a one-day case', () => {
    expect(renderDrawer(review({ case_age_days: 1 }))).toHaveTextContent('case lasted 1 day')
  })
})

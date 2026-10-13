import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

// T4-35: "Saved." is not shown on a page nobody has saved from.
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
const state = vi.hoisted(() => ({
  success: false,
  trending: { items: [] as unknown[], max_items: 10 },
  courses: { items: [] as unknown[] },
}))
vi.mock('@/queries/trendingCourses', () => ({
  useTrendingCourses: () => ({ data: state.trending, isLoading: false, isError: false }),
  useSaveTrendingCourses: () => ({ mutate: vi.fn(), isPending: false, isError: false, isSuccess: state.success }),
}))
vi.mock('@/queries/courseSuggestions', () => ({ useCourses: () => ({ data: state.courses, isLoading: false, isError: false }) }))

import { TrendingCoursesPage } from './TrendingCoursesPage'

describe('Trending Courses', () => {
  it('says nothing is saved on an untouched page, and "Saved." only after a save', () => {
    const { rerender } = render(<TrendingCoursesPage />)
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument()
    state.success = true
    rerender(<TrendingCoursesPage />)
    expect(screen.getByText('Saved.')).toBeInTheDocument()
  })
})

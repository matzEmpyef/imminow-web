import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner decision 18 (lane y): "Your Courses" is in the sidebar for a college's own institute
// account, for staff who hold "Manage course suggestions" (the permission the server checks on the
// switch). A consultancy never sees it: it has no courses of its own.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn() } }))
vi.mock('@/components/SidebarShell', () => ({
  SidebarShell: ({
    sections,
    children,
  }: {
    sections: { sidebarLinks?: { label: string; path: string }[] }[]
    children: ReactNode
  }) => (
    <div>
      <nav>
        {sections.flatMap((s) => (s.sidebarLinks ?? []).map((l) => <a key={l.path} href={l.path}>{l.label}</a>))}
      </nav>
      {children}
    </div>
  ),
}))
vi.mock('@/components/GlobalSearch', () => ({ GlobalSearch: () => null }))
vi.mock('@/components/FloatingChatWindow', () => ({ FloatingChatWindow: () => null }))
vi.mock('@/components/GlobalChatDrawer', () => ({ GlobalChatDrawer: () => null }))
vi.mock('@/components/NotificationsDropdown', () => ({ NotificationsDropdown: () => null }))
vi.mock('@/features/auth/SubscriptionBanner', () => ({ SubscriptionBanner: () => null }))
vi.mock('@/queries/activity', () => ({ useActivityFeed: () => ({ data: undefined }) }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))

import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, staffMe } from '@/test/me'
import { AppShell } from '@/features/auth/AppShell'

function signInAs(staff: Parameters<typeof staffMe>[0]) {
  vi.mocked(useMe).mockReturnValue(meAnswered(staffMe(staff)))
}

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AppShell>page</AppShell>
    </QueryClientProvider>,
  )
}

const link = () => screen.queryByRole('link', { name: 'Your Courses' })

beforeEach(() => {
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('the "Your Courses" link', () => {
  it('is shown to institute staff who hold "Manage course suggestions"', () => {
    signInAs({ consultancy_kind: 'institute', college_id: 'col-1', permissions: ['settings.manage_course_suggestions'] })
    renderShell()
    expect(link()).toHaveAttribute('href', '/administration/courses')
  })

  it('is not shown to institute staff without that permission', () => {
    signInAs({ consultancy_kind: 'institute', college_id: 'col-1', permissions: ['clients.view_own'] })
    renderShell()
    expect(link()).not.toBeInTheDocument()
  })

  it('is never shown to a consultancy, whatever its staff hold', () => {
    signInAs({ consultancy_kind: 'consultancy', permissions: ['settings.manage_course_suggestions'] })
    renderShell()
    expect(link()).not.toBeInTheDocument()
    // The link that permission does give a consultancy is still there.
    expect(screen.getByRole('link', { name: 'Course Suggestions' })).toBeInTheDocument()
  })
})
